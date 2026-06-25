import { useSearchParams } from 'react-router-dom'

// Tab state that lives in the URL (?tab=...), so refresh and the browser
// Back button keep the user's place, and tabs can be linked/bookmarked.
export default function useTabParam(defaultTab, param = 'tab') {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get(param) || defaultTab
  const setTab = (next) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      if (next === defaultTab) p.delete(param)
      else p.set(param, next)
      return p
    }, { replace: false })
  }
  return [tab, setTab]
}
