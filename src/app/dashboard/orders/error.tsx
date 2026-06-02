'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an API route or just fetch to a test endpoint so we can see it in vercel logs
    console.error("CLIENT SIDE CRASH CAUGHT:", error)
    
    // We can also just display the error message directly on the screen!
  }, [error])

  return (
    <div style={{ padding: '50px', backgroundColor: 'red', color: 'white' }}>
      <h2>Something went wrong!</h2>
      <p style={{ fontSize: '24px' }}>ERROR MESSAGE: {error.message}</p>
      <p>STACK: {error.stack}</p>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
