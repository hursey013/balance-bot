# Balance Bot Toll-Free Messaging Consent Details

This page documents how I gather and retain consent for the Balance Bot toll-free number. Twilio reviewers can use it as proof that every recipient explicitly opts in before any text messages are sent.

## Use Case

- Personal, non-commercial messaging between me and my immediate family.
- Automated checking account balance updates
- Expected volume: fewer than 50 SMS per month, typically a few per week per recipient.
- No marketing, lead generation, or third-party traffic.

## Verbal Opt-In Script

When a family member requests texts, I read the following script and obtain an explicit “yes”:

> “Hi. I send balance updates from my toll-free number. You’ll get occasional notifications whenever the balance changes. Message and data rates may apply. You can reply STOP anytime to cancel or HELP for help. Do I have your permission to send these texts?”

Only after they verbally agree do I add them to Balance Bot.

## Consent Logging

- I record each opt-in immediately after the call or in-person conversation in a private Google Sheet (`Balance Bot Opt-Ins`).
- Columns captured: recipient name, phone number, date/time of consent, the channel used (in-person or voice call), and any supporting notes.
- The sheet is stored in my Google account with two-factor authentication.
- If a recipient revokes consent or changes numbers, I update the sheet and remove them from all notification targets within Balance Bot right away.

## Confirmation Message

Every new recipient receives a confirmation SMS before any routine reminders:

> “You asked to get balance updates. Msg&data rates may apply. Reply STOP to stop, HELP for help.”

This message reaffirms consent, disclosures, and opt-out instructions.

## Opt-Out and Support Handling

- Reply `STOP`: Balance Bot immediately halts messages to that number, logs the opt-out in the Google Sheet, and I confirm removal manually.
- Reply `HELP`: The system replies with assistance text directing them to contact me by email or phone.
- Any manual requests (phone, email, in person) are honored immediately and logged.

## Privacy & Data Handling

- Collected data is limited to name, phone number, and opt-in status.
- Information stays within Balance Bot configuration files and the private Google Sheet; it is never shared with third parties.
- Backups are stored encrypted on my personal devices.
- Recipients can request deletion of their information at any time.

## Change Log

- **2024-11-27**: Initial publication for Twilio Toll-Free Verification
