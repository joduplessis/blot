import React, { type CSSProperties } from 'react'

const bubbleCount = 16
const bubbles = Array.from({ length: bubbleCount }, (_, index) => {
    const size = 6 + Math.random() * 18
    const duration = 36 + Math.random() * 18

    return {
        'left': `${((index + Math.random()) / bubbleCount) * 100}%`,
        'width': size,
        'height': size,
        'animationDuration': `${duration}s`,
        'animationDelay': `${-Math.random() * duration}s`,
        '--drift': `${(Math.random() - 0.5) * 48}px`,
    } as CSSProperties
})

export function Bubbles() {
    return (
        <div
            className="bubbles"
            aria-hidden="true">
            {bubbles.map((style, index) => (
                <span
                    key={index}
                    className="bubble"
                    style={style}
                    onClick={(event) => event.currentTarget.classList.add('is-popped')}
                    onAnimationIteration={(event) => event.currentTarget.classList.remove('is-popped')}
                />
            ))}
        </div>
    )
}
