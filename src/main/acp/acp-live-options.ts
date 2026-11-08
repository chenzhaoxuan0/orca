import { withLiveCatalogListing } from '../native-chat/agent-model-catalog/agent-model-catalog-entry'
import type { AcpStructuredConnection } from './acp-structured-connection'
import type { AcpStructuredOptions } from './acp-structured-options'

export async function acpSessionAcceptsImages(session: {
  connection: Pick<AcpStructuredConnection, 'initialize'>
}): Promise<boolean> {
  return (
    (await session.connection.initialize()).agentCapabilities?.promptCapabilities?.image === true
  )
}

export async function readAcpLiveOptions(
  session: Parameters<typeof acpSessionAcceptsImages>[0] & { options: AcpStructuredOptions },
  permissionModes?: Readonly<Partial<Record<string, string>>>
) {
  const acceptsImages = await acpSessionAcceptsImages(session)
  // Only startup establishes config resolution; later reads may reflect changed picks.
  const options = withLiveCatalogListing(session.options.read())
  return {
    ...options,
    current: {
      ...options.current,
      reportedPermissionMode: session.options.reportedPermissionMode(permissionModes)
    },
    acceptsImages
  }
}
