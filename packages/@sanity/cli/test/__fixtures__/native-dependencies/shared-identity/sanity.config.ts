import {identity} from 'dep'
import styled, {css} from 'interop'
// eslint-disable-next-line no-restricted-imports -- This fixture models a Studio config.
import {identity as shared} from 'sanity'

export default {css, div: styled.div, same: shared === identity}
