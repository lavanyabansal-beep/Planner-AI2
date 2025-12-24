export async function sendMessage(message) {
  const res = await fetch('http://localhost:4000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  })
  console.log(message);
  if (!res.ok) {
    return '⚠️ Backend error. Please try again.'
  }

  const data = await res.json()
  return data.reply || 'No response'
}
