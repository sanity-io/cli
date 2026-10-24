import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {type Context} from '@sanity/client'

export type CrawlOptions = NonNullable<Context.EditSourceParams['crawlOptions']>

/**
 * Flags for a website source's crawl options, shared by `sources create --url`
 * and `sources edit`
 */
export const crawlFlags = {
  'exclude-path': Flags.string({
    description: 'Regular expression for URL paths to skip (repeatable)',
    helpGroup: 'CRAWL',
    helpValue: '<regex>',
    multiple: true,
    multipleNonGreedy: true,
  }),
  'ignore-query-params': Flags.boolean({
    allowNo: true,
    description:
      'Treat URLs that differ only by query string as one page (on by default; turn it off when the query string selects different content, such as pagination)',
    helpGroup: 'CRAWL',
  }),
  'include-path': Flags.string({
    description:
      'Regular expression for URL paths to crawl; only matching pages are included (repeatable)',
    helpGroup: 'CRAWL',
    helpValue: '<regex>',
    multiple: true,
    multipleNonGreedy: true,
  }),
  'max-depth': Flags.integer({
    description: 'How many levels deep the crawl goes from the root URL',
    helpGroup: 'CRAWL',
    min: 0,
  }),
  'page-limit': Flags.integer({
    description: 'Maximum number of pages to crawl',
    helpGroup: 'CRAWL',
    min: 1,
  }),
  'sitemap-only': Flags.boolean({
    allowNo: true,
    description: "Crawl only the pages listed in the site's sitemap",
    helpGroup: 'CRAWL',
  }),
} satisfies FlagInput

export const CRAWL_FLAG_NAMES = Object.keys(crawlFlags) as (keyof typeof crawlFlags)[]

/**
 * The crawl options set by the crawl flags, or `undefined` when none was passed
 */
export function crawlOptionsFromFlags(flags: {
  'exclude-path'?: string[]
  'ignore-query-params'?: boolean
  'include-path'?: string[]
  'max-depth'?: number
  'page-limit'?: number
  'sitemap-only'?: boolean
}): CrawlOptions | undefined {
  const options: CrawlOptions = {
    ...(flags['include-path'] && {includePaths: flags['include-path']}),
    ...(flags['exclude-path'] && {excludePaths: flags['exclude-path']}),
    ...(flags['max-depth'] !== undefined && {maxDepth: flags['max-depth']}),
    ...(flags['page-limit'] !== undefined && {pageLimit: flags['page-limit']}),
    ...(flags['sitemap-only'] !== undefined && {sitemapOnly: flags['sitemap-only']}),
    ...(flags['ignore-query-params'] !== undefined && {
      ignoreQueryParameters: flags['ignore-query-params'],
    }),
  }
  return Object.keys(options).length > 0 ? options : undefined
}
