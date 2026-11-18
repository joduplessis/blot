import { createContext, useState } from 'react'
import { useAppStore } from '@/store/app'
import { tagPath } from '@/helpers/tags'
import type { LabelSelectLabel } from './label-select'

export const CommonContext = createContext<{
    availableLabels: LabelSelectLabel[]
    onLabelFilter(value: string): void
}>({ availableLabels: [], onLabelFilter: () => {} })

export const CommonProvider = ({ children }) => {
    const tags = useAppStore((state) => state.tags)
    const [filter, onLabelFilter] = useState('')
    const query = filter.trim()
    const labels = tags.map((tag) => ({ ...tag, text: tagPath(tags, tag) }))
    const availableLabels: LabelSelectLabel[] = labels.filter((tag) =>
        tag.text.toLowerCase().includes(query.toLowerCase())
    )
    if (query && !labels.some((tag) => tag.text.toLowerCase() === query.toLowerCase())) {
        availableLabels.push({ id: '', text: query, color: '#986a9c' })
    }

    return <CommonContext.Provider value={{ availableLabels, onLabelFilter }}>{children}</CommonContext.Provider>
}
