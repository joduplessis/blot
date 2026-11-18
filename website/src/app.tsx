import React from 'react'
import { Button, Heading, Text, View } from '@fold-ui/core'
import { Bubbles } from './bubbles'

const github = 'https://github.com/joduplessis/blot'
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`
const features = [
    [
        'The cloud has been excused.',
        'Your notes live on your computer. No account needed. Works even when the router is having a personal crisis.',
    ],
    [
        'Room for the evidence.',
        'Rich text, images, checklists, and Markdown shortcuts. The diagram may raise further questions.',
    ],
    [
        'It was here a moment ago.',
        'Nested tags, search, and pinned notes. For locating the thought last seen near the grocery list.',
    ],
    [
        'Nothing held captive.',
        'Import or export Markdown. Sync through your own folder. Open source, with clearly marked exits.',
    ],
]

export default function App() {
    return (
        <>
            <Bubbles />
            <a
                className="skip-link"
                href="#main">
                Skip to content
            </a>
            <main id="main">
                <View
                    as="section"
                    className="intro shell"
                    column
                    gap={24}
                    aria-labelledby="hero-title">
                    <img
                        className="app-icon hero-icon"
                        src={asset('favicon.png')}
                        width="76"
                        height="76"
                        alt=""
                    />
                    <Heading
                        id="hero-title"
                        as="h1"
                        fontSize="clamp(42px, 6vw, 80px)"
                        fontWeight={600}
                        lineHeight={1.06}
                        letterSpacing="-0.065em">
                        The notes have <br /> developed tentacles.
                    </Heading>
                    <Text
                        className="intro-description"
                        fontSize="clamp(17px, 2vw, 21px)"
                        lineHeight={1.55}
                        colorToken="text-weak">
                        A simple, local-first notes app.
                        <br />
                        For ideas, lists, and the occasional unexplained diagram.
                    </Text>
                    <View
                        row
                        gap={24}
                        wrap="wrap"
                        m="4px 0 0">
                        <Button
                            as="a"
                            href={github}
                            variant="accent"
                            size="md"
                            height={48}
                            radius={99}
                            p="14px 24px"
                            flat>
                            Get Blot on GitHub
                        </Button>
                        <Text
                            as="a"
                            href="#features"
                            size="md"
                            colorToken="text-weak">
                            Explore the details <span aria-hidden="true">↓</span>
                        </Text>
                    </View>
                    <Text
                        size="xs"
                        colorToken="text-weak">
                        macOS · Windows · Linux
                    </Text>
                </View>

                <figure className="product">
                    <div className="hero-art">
                        <a
                            className="app-screenshot"
                            href={asset('blot-screenshot.jpg')}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="View the full Blot screenshot (opens in a new tab)">
                            <img
                                src={asset('blot-screenshot.jpg')}
                                width="1920"
                                height="1253"
                                alt="Blot showing imported notes, nested tags, and A weekend prototype with an illustrated village and checklist"
                            />
                        </a>
                    </div>
                    <figcaption>The thoughts have been separated into enclosures.</figcaption>
                </figure>

                <section
                    id="features"
                    className="features shell"
                    aria-labelledby="features-title">
                    <Heading
                        id="features-title"
                        as="h2"
                        fontSize="clamp(32px, 4vw, 48px)"
                        fontWeight={600}
                        lineHeight={1.15}
                        letterSpacing="-0.05em"
                        textAlign="center">
                        A little order. Nothing alarming.
                    </Heading>
                    <div className="feature-list">
                        {features.map(([title, description]) => (
                            <View
                                as="article"
                                key={title}
                                column
                                alignItems="flex-start"
                                justifyContent="flex-start"
                                gap={12}>
                                <Heading
                                    as="h3"
                                    fontSize={22}
                                    fontWeight={600}
                                    letterSpacing="-0.035em">
                                    {title}
                                </Heading>
                                <Text
                                    colorToken="text-weak"
                                    lineHeight={1.7}>
                                    {description}
                                </Text>
                            </View>
                        ))}
                    </div>
                </section>
            </main>

            <View
                as="footer"
                className="site-footer shell"
                row
                justifyContent="space-between"
                gap={20}
                wrap="wrap">
                <Text
                    size="sm"
                    colorToken="text-weak">
                    Blot. Open source. No tentacles attached.
                </Text>
                <View
                    as="nav"
                    row
                    gap={24}
                    aria-label="Project links">
                    <a href={`${github}#readme`}>Readme</a>
                    <a href={`${github}/issues`}>Issues</a>
                    <a href={github}>GitHub ↗</a>
                </View>
            </View>
        </>
    )
}
