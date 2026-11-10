import {contextCommand} from '../../../actions/context/contextCommand.js'
import {type OperationRequest} from '../../../actions/context/operationInput.js'
import {getSource} from '../../../services/context.js'

const BaseCommand = contextCommand('context sources edit')

/**
 * `context sources edit` merges crawl option flags onto the source's stored
 * crawl options: the API replaces `crawlOptions` as a whole, so changing one
 * flag must not drop the others.
 */
export class UpdateSourceCommand extends BaseCommand {
  public override async send(
    request: OperationRequest,
    values: Record<string, unknown>,
  ): Promise<unknown> {
    const crawlOptions = request.body?.crawlOptions
    if (typeof crawlOptions !== 'object' || crawlOptions === null) {
      return super.send(request, values)
    }
    const source = await getSource(request.params.knowledgeBaseId, request.params.sourceId)
    const stored = 'crawlOptions' in source ? source.crawlOptions : undefined
    return super.send(
      {...request, body: {...request.body, crawlOptions: {...stored, ...crawlOptions}}},
      values,
    )
  }
}
