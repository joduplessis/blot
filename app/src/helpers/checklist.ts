import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { readSchedule, type ScheduledTask } from './task-schedule'

type HtmlNode = DefaultTreeAdapterMap['node']

const taskText = (node: HtmlNode): string => {
    if ('value' in node) return node.value
    if ('tagName' in node && ['ul', 'ol', 'label'].includes(node.tagName)) return ''
    if ('tagName' in node && node.tagName === 'br') return ' '

    return 'childNodes' in node ? node.childNodes.map(taskText).join('') + (node.nodeName === 'p' ? ' ' : '') : ''
}

export const countChecklist = (body: string) => {
    const scheduledTasks: ScheduledTask[] = []
    const counts = { checklistTotal: 0, checklistChecked: 0, scheduledTasks }
    const visit = (node: HtmlNode) => {
        if ('tagName' in node) {
            if (['pre', 'code', 'script', 'style'].includes(node.tagName)) return
            if (
                node.tagName === 'li' &&
                node.attrs.some((attr) => attr.name === 'data-type' && attr.value === 'taskItem')
            ) {
                const index = counts.checklistTotal++
                const attribute = (name: string) => node.attrs.find((attr) => attr.name === name)?.value
                const checked = attribute('data-checked')
                if (checked === '' || checked === 'true') counts.checklistChecked++
                else {
                    const schedule = readSchedule(attribute('data-schedule'), attribute('data-due-date'))
                    if (schedule) scheduledTasks.push({ index, text: taskText(node).trim(), schedule })
                }
            }
        }

        if ('childNodes' in node) node.childNodes.forEach(visit)
    }
    visit(parseFragment(body))
    return counts
}
