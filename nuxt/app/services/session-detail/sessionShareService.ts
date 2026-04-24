export async function shareSessionLink(params: {
  sessionId: string
  generateShareLink: (sessionId: string) => Promise<string>
  clipboard?: Pick<Clipboard, 'writeText'>
}): Promise<string> {
  const { sessionId, generateShareLink, clipboard } = params
  const link = await generateShareLink(sessionId)
  await (clipboard || navigator.clipboard).writeText(link)
  return link
}
