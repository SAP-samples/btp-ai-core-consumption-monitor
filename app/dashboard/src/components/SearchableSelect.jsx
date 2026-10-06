import { useState, useEffect, useRef } from 'react'

/**
 * Generic searchable dropdown.
 * options: [{ value, label }]
 * value: currently selected value (or null/'' for "all")
 * onChange(value | null): called when selection changes
 * placeholder: text shown when nothing is selected
 * allLabel: label for the "show all" row (default "All")
 * showAll: whether to include an "All" row (default true)
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Search…',
  allLabel = 'All',
  showAll = true,
  icon: Icon,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const selected = options.find(o => o.value === value)
  const filtered = query
    ? options.filter(o => o.label?.toLowerCase().includes(query.toLowerCase()))
    : options

  function handleFocus() {
    setQuery('')
    setOpen(true)
  }

  function handleSelect(val) {
    onChange(val || null)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-sap-blue">
        {Icon && <Icon size={14} className="ml-2.5 text-gray-400 shrink-0" />}
        <input
          type="text"
          value={open ? query : (selected?.label || '')}
          onFocus={handleFocus}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          placeholder={placeholder}
          className="w-full text-sm px-2 py-1.5 bg-transparent dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
        />
        {value && !open && (
          <button
            onClick={() => handleSelect(null)}
            className="mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title="Clear"
          >✕</button>
        )}
        {!value && !open && (
          <span className="mr-2 text-gray-400 pointer-events-none">▾</span>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {showAll && (
            <button
              onMouseDown={() => handleSelect(null)}
              className="w-full text-left px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b dark:border-gray-700"
            >
              {allLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
          ) : (
            filtered.map(o => (
              <button
                key={o.value}
                onMouseDown={() => handleSelect(o.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  o.value === value
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-sap-blue font-medium'
                    : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
