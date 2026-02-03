import {createHash} from 'node:crypto'
import {createReadStream, type ReadStream} from 'node:fs'
import fs, {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {text} from 'node:stream/consumers'
import {pipeline} from 'node:stream/promises'
import {styleText} from 'node:util'

import {spinner} from '@sanity/cli-core/ux'
import {type SanityClient} from '@sanity/client'
import {type FileAsset, type ImageAsset, type SanityDocument} from '@sanity/types'
import gunzipMaybe from 'gunzip-maybe'
// @ts-expect-error `peek-stream` module currently untyped
import isTar from 'is-tar'
// @ts-expect-error `peek-stream` module currently untyped
import peek from 'peek-stream'
import {
  catchError,
  EMPTY,
  filter,
  from,
  map,
  mergeMap,
  mergeWith,
  type Observable,
  of,
  type OperatorFunction,
  switchMap,
  tap,
  zip,
} from 'rxjs'
import tar from 'tar-fs'
import {glob} from 'tinyglobby'

import {findNdjsonEntry} from '../../util/findNdjsonEntry.js'
import {importMediaDebug} from './importMediaDebug.js'

const DEFAULT_CONCURRENCY = 6

interface MediaLibraryUploadResult {
  asset: SanityDocument & {
    _type: 'sanity.asset'
    aspects: unknown
    assetType: FileAsset['_type'] | ImageAsset['_type']
  }
  assetInstance: FileAsset | ImageAsset
}

interface MediaLibraryUploadResponse {
  body: MediaLibraryUploadResult
  type: 'response'
}

export interface State {
  /**
   * The last asset processed.
   */
  asset: AssetWithAspects
  /**
   * The count of input files.
   */
  fileCount: number
}

interface ResolvedAsset {
  /**
   * The ids of the `sanity.asset` documents that currently refer to the asset.
   *
   * These documents contain aspects, and reference an asset instance document.
   */
  assetIds: string[]
  isExistingAsset: boolean
  /**
   * The original filename of the asset as it appears in the import source.
   *
   * Note: Currently includes `images/` or `files/` prefix.
   */
  originalFilename: string
  sha1Hash: string
}

export type AssetWithAspects<Asset extends ResolvedAsset = ResolvedAsset> = Asset & {
  aspects: unknown | undefined
}

interface Options {
  client: SanityClient
  replaceAspects: boolean
  sourcePath: string
  spinner: ReturnType<typeof spinner>
}

interface Context extends Options {
  ndjson: () => ReadStream
  workingPath: string
}

export function importer(options: Options): Observable<State> {
  return resolveSource(options).pipe(
    mergeMap(({aspectsNdjsonPath, files, images, workingPath}) => {
      const fileCount = files.length + images.length

      if (fileCount === 0) {
        throw new Error('No assets to import')
      }

      const context: Context = {
        ...options,
        ndjson: () => createReadStream(aspectsNdjsonPath),
        workingPath,
      }

      return from(files).pipe(
        switchMap((file) => zip(of<'file'>('file'), of(file))),
        mergeWith(from(images).pipe(switchMap((file) => zip(of<'image'>('image'), of(file))))),
        fetchExistingAssets(context),
        uploadAsset(context),
        resolveAspectData(context),
        setAspects(context),
        map((asset) => ({
          asset,
          fileCount,
        })),
      )
    }),
  )
}

/**
 * @internal
 */
export function resolveSource({sourcePath}: Pick<Context, 'sourcePath'>): Observable<{
  aspectsNdjsonPath: string
  files: string[]
  images: string[]
  workingPath: string
}> {
  return from(fs.stat(sourcePath)).pipe(
    switchMap((stats) => {
      return stats.isDirectory()
        ? of(sourcePath)
        : from(mkdtemp(path.join(tmpdir(), 'sanity-media-library-import'))).pipe(
            switchMap((tempPath) => {
              return from(
                pipeline(createReadStream(sourcePath), gunzipMaybe(), untarMaybe(tempPath)),
              ).pipe(map(() => tempPath))
            }),
          )
    }),
    switchMap((importSourcePath) => {
      return from(
        glob(['**/data.ndjson'], {
          absolute: true,
          cwd: importSourcePath,
          deep: 2,
        }),
      ).pipe(
        map(([aspectsNdjsonPath]) => ({
          aspectsNdjsonPath,
          importSourcePath,
          workingPath:
            aspectsNdjsonPath === undefined ? importSourcePath : path.dirname(aspectsNdjsonPath),
        })),
      )
    }),
    tap(({aspectsNdjsonPath, importSourcePath}) => {
      if (aspectsNdjsonPath === undefined) {
        throw new Error(
          `No ${styleText('bold', 'data.ndjson')} file found in import source ${styleText('bold', importSourcePath)}`,
        )
      }
      importMediaDebug(`[Found NDJSON file] ${aspectsNdjsonPath}`)
    }),
    switchMap(({aspectsNdjsonPath, workingPath}) => {
      return from(
        Promise.all([
          glob(['files/*'], {
            cwd: workingPath,
          }),
          glob(['images/*'], {
            cwd: workingPath,
          }),
        ]),
      ).pipe(
        map(([files, images]) => ({
          aspectsNdjsonPath,
          files,
          images,
          workingPath,
        })),
      )
    }),
  )
}

/**
 * Untar the stream if its contents appear to be tarred.
 *
 * @internal
 */
function untarMaybe(outputPath: string) {
  // @ts-expect-error `peek-stream` module currently untyped
  return peek({maxBuffer: 300, newline: false}, (data, swap) => {
    if (isTar(data)) {
      return swap(null, tar.extract(outputPath))
    }

    return swap(null)
  })
}

/**
 * Fetch the ids of all asset documents that reference the input asset.
 * The input asset is identified by its SHA-1 hash.
 *
 * @internal
 */
function fetchAssetsByHash({
  client,
  type,
}: {
  client: SanityClient
  type: 'file' | 'image'
}): OperatorFunction<string, [hash: string, assetIds: string[]]> {
  return switchMap((hash) =>
    client.observable
      .fetch<string[]>(
        `*[
          _type == "sanity.asset" &&
          currentVersion._ref == *[
            _type == $type &&
            sha1hash == $hash
          ][0]._id
        ]._id`,
        {
          hash,
          type: ['sanity', `${type}Asset`].join('.'),
        },
        {
          tag: 'asset.getId',
        },
      )
      .pipe(switchMap((assetIds) => zip(of(hash), of(assetIds)))),
  )
}

function fetchExistingAssets({
  client,
  workingPath,
}: Context): OperatorFunction<
  [type: 'file' | 'image', asset: string],
  [type: 'file' | 'image', asset: string, hash: string] | ResolvedAsset
> {
  return mergeMap(([type, asset]) => {
    const createSha1Hash = createHash('sha1')

    const sha1hash = text(
      createReadStream(path.join(workingPath, asset)).pipe(createSha1Hash).setEncoding('hex'),
    )

    return from(sha1hash).pipe(
      tap((hash) =>
        importMediaDebug(`[Asset ${asset}] Checking for ${type} asset with hash ${hash}`),
      ),
      fetchAssetsByHash({client, type}),
      map<
        [string, string[]],
        [type: 'file' | 'image', asset: string, hash: string] | ResolvedAsset
      >(([hash, assetIds]) => {
        if (assetIds.length === 0) {
          return [type, asset, hash]
        }

        return {
          assetIds,
          isExistingAsset: true,
          originalFilename: asset,
          sha1Hash: hash,
        }
      }),
    )
  })
}

/**
 * Find the first matching entry in the provided NDJSON stream and attach it to the asset object.
 *
 * @internal
 */
function resolveAspectData({ndjson}: Context): OperatorFunction<ResolvedAsset, AssetWithAspects> {
  return mergeMap((resolvedAsset) =>
    from(
      findNdjsonEntry<{aspects: unknown}>(
        ndjson(),
        (line) =>
          typeof line === 'object' &&
          line !== null &&
          'filename' in line &&
          line.filename === resolvedAsset.originalFilename,
      ),
    ).pipe(
      map((aspectsFromImport) => ({
        ...resolvedAsset,
        aspects: aspectsFromImport?.aspects,
      })),
    ),
  )
}

// TODO: Batch mutations to reduce HTTP request count.
export function setAspects({
  client,
  replaceAspects,
}: Pick<Context, 'client' | 'replaceAspects'>): OperatorFunction<
  AssetWithAspects,
  AssetWithAspects
> {
  return mergeMap((asset) => {
    const {aspects, assetIds, isExistingAsset} = asset

    if (isExistingAsset && !replaceAspects) {
      importMediaDebug(`[Asset ${asset.originalFilename}] Skipping replacement of existing aspects`)
      return of(asset)
    }

    if (aspects === undefined) {
      importMediaDebug(`[Asset ${asset.originalFilename}] No aspects to import`)
      return of(asset)
    }

    const transaction = client.observable.transaction()
    for (const assetId of assetIds) {
      transaction.patch(assetId, {set: {aspects}})
    }

    importMediaDebug(
      `[Asset ${asset.originalFilename}] Setting aspects on asset documents ${JSON.stringify(assetIds)}`,
    )

    return transaction
      .commit({
        tag: 'asset.setAspects',
        visibility: 'async',
      })
      .pipe(map(() => asset))
  }, DEFAULT_CONCURRENCY)
}

function uploadAsset({
  client,
  workingPath,
}: Context): OperatorFunction<
  [type: 'file' | 'image', asset: string, hash: string] | ResolvedAsset,
  ResolvedAsset
> {
  return mergeMap((maybeResolvedAsset) => {
    if ('assetIds' in maybeResolvedAsset) {
      importMediaDebug(
        `[Asset ${maybeResolvedAsset.originalFilename}] Skipping upload of existing asset with hash ${maybeResolvedAsset.sha1Hash}`,
      )
      return of(maybeResolvedAsset)
    }

    const [type, asset, hash] = maybeResolvedAsset
    importMediaDebug(`[Asset ${asset}] Uploading new asset`)

    return client.observable.assets
      .upload(type, createReadStream(path.join(workingPath, asset)), {
        tag: 'asset.upload',
      })
      .pipe(
        catchError((error) => {
          // An asset matching the hash was not found during previous steps, but appears to exist upon upload.
          //
          // This may occur if:
          //   - The asset was uploaded by another client since the check was performed.
          //   - The asset instance document exists, but is not referenced by any asset document.
          if (error.statusCode === 409) {
            importMediaDebug(
              `[Asset ${asset}] Cannot overwrite existing ${type} asset with hash ${hash}`,
            )
            return EMPTY
          }
          return EMPTY
        }),
        filter((response) => response.type === 'response'),
        tap(() => importMediaDebug(`[Asset ${asset}] Finished uploading new asset`)),
        // TODO: The `client.assets.upload` method should return `MediaLibraryUploadResponse` when operating on Media Library resources. When that occurs, this type assertion can be removed.
        map((response) => (response as unknown as MediaLibraryUploadResponse).body),
        map<MediaLibraryUploadResult, ResolvedAsset>((result) => ({
          assetIds: [result.asset._id],
          isExistingAsset: false,
          originalFilename: asset,
          sha1Hash: hash,
        })),
      )
  }, DEFAULT_CONCURRENCY)
}
