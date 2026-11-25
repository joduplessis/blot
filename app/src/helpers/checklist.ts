import { defaultTreeAdapter, parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'
import { readSchedule, type ScheduledTask, type TaskSchedule } from './task-schedule'

type HtmlNode = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']
type TextNode = DefaultTreeAdapterMap['textNode']

export const CALENDAR_NOTE_ID = 'calendar-tasks'
export const isCalendarNote = (id: string) => id === CALENDAR_NOTE_ID || id.startsWith(CALENDAR_NOTE_ID + '-')

const attribute = (item: Element, name: string) => item.attrs.find((attr) => attr.name === name)?.value

export const taskItems = (root: HtmlNode) => {
    const items: Element[] = []
    const visit = (node: HtmlNode) => {
        if ('tagName' in node) {
            if (['pre', 'code', 'script', 'style'].includes(node.tagName)) return
            if (node.tagName === 'li' && attribute(node, 'data-type') === 'taskItem') items.push(node)
        }

        if ('childNodes' in node) node.childNodes.forEach(visit)
    }

    visit(root)
    return items
}

// The first line is the editable title. Keep subsequent paragraphs, files and nested tasks in the note.
const taskTitle = (item: Element) => {
    const child = (parent: Element, tag: string) =>
        parent.childNodes.find((node): node is Element => 'tagName' in node && node.tagName === tag)
    const content = child(item, 'div') || item
    const paragraph = child(content, 'p') || content
    const nodes: TextNode[] = []
    const visit = (node: HtmlNode): boolean => {
        if (defaultTreeAdapter.isTextNode(node)) nodes.push(node)
        if (!('tagName' in node)) return false
        if (['br', 'ol', 'ul'].includes(node.tagName)) return true
        if (node.tagName === 'label' || attribute(node, 'href')?.startsWith('noted://attachments/')) return false

        return node.childNodes.some(visit)
    }

    paragraph.childNodes.some(visit)
    return { paragraph, nodes, text: nodes.map((node) => node.value).join('') }
}

export const countChecklist = (body: string) => {
    const scheduledTasks: ScheduledTask[] = []
    const items = taskItems(parseFragment(body))
    let checklistChecked = 0

    items.forEach((item, index) => {
        const checked = attribute(item, 'data-checked')
        if (checked === '' || checked === 'true') {
            checklistChecked++
            return
        }

        const schedule = readSchedule(attribute(item, 'data-schedule'), attribute(item, 'data-due-date'))
        if (schedule) scheduledTasks.push({ index, text: taskTitle(item).text, schedule })
    })

    return { checklistTotal: items.length, checklistChecked, scheduledTasks }
}

export const editTaskBody = (
    body: string,
    index: number,
    title: string | undefined,
    schedule: TaskSchedule | null,
    complete: boolean
) => {
    const root = parseFragment(body)
    const item = taskItems(root)[index]
    if (!item) return body

    if (title !== undefined) {
        const { paragraph, nodes, text } = taskTitle(item)
        // Replace only the changed span so unchanged text keeps its formatting and links.
        let start = 0
        let end = text.length
        let nextEnd = title.length
        while (start < end && text[start] === title[start]) start++
        while (end > start && nextEnd > start && text[end - 1] === title[nextEnd - 1]) {
            end--
            nextEnd--
        }

        const replacement = title.slice(start, nextEnd)
        let offset = 0
        let inserted = false
        for (const node of nodes) {
            const value = node.value
            const limit = offset + value.length
            if (limit >= start && offset <= end) {
                node.value =
                    value.slice(0, Math.max(0, start - offset)) +
                    (inserted ? '' : replacement) +
                    value.slice(Math.max(0, end - offset))
                inserted = true
            }
            offset = limit
        }

        if (!nodes.length && title) {
            const first = paragraph.childNodes.find((node) => !('tagName' in node && node.tagName === 'label'))
            if (first) defaultTreeAdapter.insertTextBefore(paragraph, title, first)
            else defaultTreeAdapter.insertText(paragraph, title)
        }
    }

    if (complete) {
        item.attrs = item.attrs.filter((attr) => attr.name !== 'data-checked')
        item.attrs.push({ name: 'data-checked', value: 'true' })
        return serialize(root)
    }

    item.attrs = item.attrs.filter((attr) => attr.name !== 'data-schedule' && attr.name !== 'data-due-date')
    if (schedule) {
        item.attrs.push({ name: 'data-schedule', value: JSON.stringify(schedule) })
        item.attrs.push({ name: 'data-due-date', value: schedule.start.slice(0, 10) })
    }

    return serialize(root)
}
