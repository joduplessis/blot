export const DEFAULT_READING_FONT_SIZE = 17
export const MIN_READING_FONT_SIZE = 13
export const MAX_READING_FONT_SIZE = 25

export const clampReadingFontSize = (size: number) =>
    Number.isFinite(size)
        ? Math.min(MAX_READING_FONT_SIZE, Math.max(MIN_READING_FONT_SIZE, Math.round(size)))
        : DEFAULT_READING_FONT_SIZE

export const readReadingFontSize = () => {
    try {
        const value = localStorage.getItem('noted-reading-font-size')
        return value?.trim() ? clampReadingFontSize(Number(value)) : DEFAULT_READING_FONT_SIZE
    } catch {
        return DEFAULT_READING_FONT_SIZE
    }
}
