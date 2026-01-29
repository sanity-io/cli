import {useEffect, useState} from 'react'

// Look ma, SVG imports in the config 🙈
import iconPath from './descriptionIcon.svg'
// Look ma, CSS module imports in the config 🙈
import styles from './descriptionInput.module.css'

// Look ma, process.env variables in the config 🙈
if (process.env.SANITY_STUDIO_PREFIXED_VAR !== 'yes-this-is-prefixed') {
  throw new Error('`process.env.SANITY_STUDIO_PREFIXED_VAR` is not set to `yes-this-is-prefixed`')
}

// Look ma, import.meta.env variables in the config 🙈
if (import.meta.env.SANITY_STUDIO_PREFIXED_VAR !== 'yes-this-is-prefixed') {
  throw new Error(
    '`import.meta.env.SANITY_STUDIO_PREFIXED_VAR` is not set to `yes-this-is-prefixed`',
  )
}

export default function DescriptionInput() {
  const [counter, setCounter] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      setCounter((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className={styles.input}>
      <img src={iconPath} style={{width: '32px'}} />
      Look ma, gradients, icons & counters
      <div className={styles.counter}>{counter}</div>
    </div>
  )
}

const logCallback = requestIdleCallback(() => {
  console.log('Look ma, requestIdleCallback in the config 🙈')
})

if (document.location.hostname === 'localhost') {
  console.log('Look ma, `document` references in the config 🙈')
}

// Look ma, unchecked `window` references in the config 🙈
window.addEventListener('beforeunload', () => {
  cancelIdleCallback(logCallback)
})

// Look ma, this will just run forever 🙈
setInterval(() => {
  console.log('Look ma, setInterval in the config 🙈')
}, 15_000)
