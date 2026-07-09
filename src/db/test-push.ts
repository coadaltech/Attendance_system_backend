// One-off manual trigger for testing push notifications without waiting for the
// 10 AM schedule. Run with: bun run src/db/test-push.ts
// Delete this file once you've confirmed push notifications work end-to-end.
import { sendPunchInReminder } from '../routes/push'

console.log('Sending punch-in reminder to all subscribed active employees...')
await sendPunchInReminder()
console.log('Done. Check the browser/device you subscribed with for a notification.')
process.exit(0)
