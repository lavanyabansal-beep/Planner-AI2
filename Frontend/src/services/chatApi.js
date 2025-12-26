export async function sendMessage(message, activeProjectId) {
  const res = await fetch('http://localhost:4000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, activeProjectId })
  })
  console.log(message);
  if (!res.ok) {
    return { reply: '⚠️ Backend error. Please try again.' }
  }

  const data = await res.json()
  return data
}
