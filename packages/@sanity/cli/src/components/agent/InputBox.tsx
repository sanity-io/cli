import {Box, Text} from 'ink'
import TextInput from 'ink-text-input'

interface InputBoxProps {
  disabled: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  value: string
}

export function InputBox({disabled, onChange, onSubmit, value}: InputBoxProps) {
  // Handle disabled state by providing no-op functions when disabled
  const handleChange = disabled ? () => {} : onChange
  const handleSubmit = disabled ? () => {} : onSubmit

  return (
    <Box
      borderColor="gray"
      borderLeft={false}
      borderRight={false}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      width="100%"
    >
      <Box flexDirection="row" paddingTop={1} width="100%">
        <Text color="yellow" dimColor={disabled}>
          &gt;{' '}
        </Text>
        <Box flexGrow={1}>
          <TextInput
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder={disabled ? 'Please wait...' : 'Type your message...'}
            value={value}
          />
        </Box>
      </Box>
    </Box>
  )
}
