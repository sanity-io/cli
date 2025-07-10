import {type JSX} from 'react'

export function Favicons(): JSX.Element {
  const base = '/static'
  return (
    <>
      <link href={`${base}/favicon.ico`} rel="icon" sizes="any" />
      <link href={`${base}/favicon.svg`} rel="icon" type="image/svg+xml" />
      <link href={`${base}/apple-touch-icon.png`} rel="apple-touch-icon" />
      <link href={`${base}/manifest.webmanifest`} rel="manifest" />
    </>
  )
}
