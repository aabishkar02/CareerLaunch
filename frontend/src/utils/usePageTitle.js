import { useEffect } from 'react'

const SUFFIX = 'CareerLaunch'

// Sets the browser tab title for the current page.
// usePageTitle('Courses') → "Courses · CareerLaunch"
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX
  }, [title])
}
