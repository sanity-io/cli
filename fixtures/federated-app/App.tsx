import {useState} from 'react'
import styled, {createGlobalStyle} from 'styled-components'

const GlobalStyle = createGlobalStyle<{color: string; id: string}>`
  #${(props) => props.id} { background-color: ${(props) => props.color}; }
`
const Box = styled.button`
  color: red;
`

export default function App({color = 'white', id = 'app'} = {}) {
  const [count, setCount] = useState(0)
  return (
    <>
      <GlobalStyle color={color} id={id} />
      <Box onClick={() => setCount(count + 1)}>Hello {count}</Box>
    </>
  )
}
