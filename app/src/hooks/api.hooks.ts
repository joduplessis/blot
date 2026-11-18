export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
export const notesAPI = () => {
    if (!window.blot) throw new Error('Open the Blot desktop app to save your notes.')
    return window.blot
}
