import {Box, Text} from 'ink'

export function Header() {
  return (
    <Box borderColor="cyan" borderStyle="round" paddingX={1}>
      <Text bold color="cyan">
        Sanity Agent
      </Text>
    </Box>
  )
}
