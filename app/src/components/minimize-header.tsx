import { Button, Header, Icon, View } from '@fold-ui/core'

export const MinimizeHeader = ({ children = null, ...props }) => {
    return (
        <Header
            height="var(--header-height)"
            p="var(--header-padding)"
            width="100%"
            className="minimize-header"
            bgToken="surface"
            {...props}>
            <View
                row
                width="100%"
                gap="0.5rem"
                colorToken="text">
                {children}
            </View>
        </Header>
    )
}
