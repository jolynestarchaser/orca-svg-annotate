import { mergeSvg } from './notes'

/** The only code that talks to Orca: sends edits, keeps unsaved typing, merges outside writes. */
export function start() {
  const document = orca.document
  if (!document) {
    throw new Error('this file runs as a custom editor')
  }
  return document.session<string>({ merge: mergeSvg })
}
