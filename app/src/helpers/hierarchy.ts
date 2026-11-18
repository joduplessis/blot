const byPosition = (a, b) => a.position - b.position
const generateHighestChildPosition = (items, id) =>
    Math.max(0, ...items.filter((item) => item.parentId === id).map((item) => item.position)) + 1000
const getNewPositionForTargetIndex = (items, index) =>
    !items.length
        ? 1000
        : index === 0
        ? items[0].position - 1000
        : index === items.length
        ? items[index - 1].position + 1000
        : (items[index - 1].position + items[index].position) / 2

export const getCorrectParentId = (tags, target) => {
    if (target.focus) return tags[target.index]?.id ?? null

    for (let i = target.index - 1; i >= 0; i--) {
        if (tags[i]?.indent < target.indent) {
            return tags[i].id
        }
    }

    return null
}

export const getTagDropPosition = (tags, allTags, target) => {
    const parentId = getCorrectParentId(tags, target)

    if (target.focus && tags[target.index]) {
        return { parentId, position: generateHighestChildPosition(allTags, parentId) }
    }

    const siblings = tags.filter((tag) => tag.parentId == parentId)
    const nextSibling = tags.slice(target.index).find((tag) => tag.parentId == parentId)
    const position = getNewPositionForTargetIndex(
        siblings,
        nextSibling ? siblings.indexOf(nextSibling) : siblings.length
    )

    return { parentId, position }
}

export const isDescendantOf = (tags, candidateId, ancestorId) => {
    let id = candidateId
    while (id) {
        if (id === ancestorId) return true
        id = tags.find((p) => p.id === id)?.parentId
    }
    return false
}

export const getDescendantIds = (tags, parentId) => {
    const direct = tags.filter((p) => p.parentId === parentId).map((p) => p.id)
    return direct.flatMap((id) => [id, ...getDescendantIds(tags, id)])
}

export function sortHierarchy(tags) {
    function buildLevel(currentParentId, indent) {
        const children = tags.filter((tag) => tag.parentId == currentParentId)

        children.sort(byPosition)

        return children.flatMap((tag) => {
            const childCount = tags.filter((p) => p.parentId === tag.id).length
            const isParent = childCount > 0

            const processedTag = {
                ...tag,
                indent: indent,
                isParent: isParent,
                childCount: childCount,
            }

            const descendants = buildLevel(tag.id, indent + 1)

            return [processedTag, ...descendants]
        })
    }

    return buildLevel(null, 0)
}

export const filterVisibleTags = (tags, collapsed, draggedTagId) => {
    const parents = new Map(tags.map((tag) => [tag.id, tag.parentId]))

    return tags.filter((tag) => {
        let parentId = tag.parentId

        while (parentId) {
            if (collapsed.includes(parentId) || parentId == draggedTagId) return false
            parentId = parents.get(parentId)
        }

        return true
    })
}
