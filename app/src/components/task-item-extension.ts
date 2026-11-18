import TaskItem, { type TaskItemOptions } from '@tiptap/extension-task-item'
import { IconLib } from '@fold-ui/core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readSchedule, scheduleDate, type TaskSchedule } from '@/helpers/task-schedule'

export type TaskDatePicker = {
    target: HTMLButtonElement
    rect: DOMRect
    schedule: TaskSchedule | null
    save: (schedule: TaskSchedule | null) => boolean
}

const dateLabel = (schedule: TaskSchedule) => {
    const format = (stamp: string) =>
        scheduleDate(stamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            ...(schedule.wholeDay ? {} : { hour: 'numeric', minute: '2-digit' }),
        })

    return (schedule.repeat ? '↻ ' : '') + format(schedule.start) + (schedule.end ? ' - ' + format(schedule.end) : '')
}

export const DatedTaskItem = TaskItem.extend<TaskItemOptions & { onPick: (picker: TaskDatePicker) => void }>({
    addAttributes() {
        return {
            ...this.parent(),
            schedule: {
                default: null,
                keepOnSplit: false,
                parseHTML: (element) =>
                    readSchedule(element.getAttribute('data-schedule'), element.getAttribute('data-due-date')),
                renderHTML: ({ schedule }) =>
                    schedule
                        ? {
                              'data-due-date': schedule.start.slice(0, 10),
                              'data-schedule': JSON.stringify(schedule),
                          }
                        : {},
            },
        }
    },
    addNodeView() {
        const renderTask = this.parent()
        const icon = renderToStaticMarkup(createElement(IconLib, { icon: 'calendar', size: 'xs' }))

        return (props) => {
            const { editor, getPos, node } = props
            const task = renderTask(props)
            const button = document.createElement('button')
            button.id = 'task-date-' + crypto.randomUUID()
            button.type = 'button'
            button.className = 'task-due-date'
            button.contentEditable = 'false'
            button.ariaLabel = 'Task schedule'
            let schedule = node.attrs.schedule as TaskSchedule | null

            const updateButton = () => {
                if (schedule) button.textContent = dateLabel(schedule)
                else button.innerHTML = icon
                button.title = schedule ? 'Edit task schedule' : 'Schedule task'
                button.disabled = !editor.isEditable
            }

            button.onmousedown = (event) => event.preventDefault()
            button.onclick = () => {
                const original = schedule
                const doc = editor.state.doc
                const clickedPos = getPos()
                this.options.onPick({
                    target: button,
                    rect: button.getBoundingClientRect(),
                    schedule,
                    save: (value) => {
                        if (editor.isDestroyed || !editor.isEditable) return false

                        const pos = getPos() ?? (editor.state.doc.eq(doc) ? clickedPos : undefined)
                        if (pos === undefined) return false
                        const current = editor.state.doc.nodeAt(pos)
                        if (
                            current?.type !== node.type ||
                            JSON.stringify(current.attrs.schedule) !== JSON.stringify(original)
                        )
                            return false

                        editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'schedule', value))
                        return true
                    },
                })
            }

            updateButton()
            task.dom.appendChild(button)

            return {
                ...task,
                stopEvent: (event) => button.contains(event.target as globalThis.Node),
                update: (updatedNode, decorations, innerDecorations) => {
                    if (!task.update(updatedNode, decorations, innerDecorations)) return false

                    if (schedule !== updatedNode.attrs.schedule || button.disabled === editor.isEditable) {
                        schedule = updatedNode.attrs.schedule
                        updateButton()
                    }
                    return true
                },
            }
        }
    },
})
