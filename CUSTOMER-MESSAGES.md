# Customer WhatsApp messaging

Admin → WhatsApp & email → Customer messages.

Filter by district/route and search by name or phone. Select individuals or all filtered customers. Changing filters clears selection so hidden recipients are not inadvertently sent a message. Review the exact recipient list before Send; at most 100 unique valid numbers per batch. Shared numbers are sent once, using the first selected customer's name.

Use {{customer_name}} in saved templates. Bold uses *text* and italic uses _text_. WhatsApp has no native underline: include underlined material in an attached image or PDF instead. Templates save message text, not attachments.

Attach one JPG/PNG/WebP image or PDF up to 5 MB. Text messages allow 4096 characters; attachment captions allow 1024 after personalisation. Media requires the configured VETMECH MSG /api/v1/messages gateway with a connected session and send permission. Delivery status lookup also needs read permission. Attachment bytes are forwarded during the request and are not stored on the VPS.

Sending occurs only after the Admin clicks Send in the review screen. Recipients are processed sequentially. Stop finishes the current request and leaves later recipients unsent. A gateway failure/uncertain outcome stops the batch. Check Delivery logs and the gateway before making a new batch; an accepted/submitted response is not proof of delivery. Stable message IDs prevent the same batch/phone request from being resent. Generic log retries are disabled for broadcasts to avoid resending an attachment as plain text. No live messages are sent by automated tests.

# Daily GPS customer captures

The map includes saved customer GPS captures, attendance, and visits in time order. Customer captures are separate from completed visit counts. A customer save now writes an immutable capture snapshot in the same transaction, with the signed-in actor as the capturer. Updating customer location does not overwrite earlier snapshots. GPS copied from visit closure is not duplicated as a customer capture.

Pre-update customer records have only the latest saved coordinate and timestamp. The map may show that location under the customer's current assigned MR, clearly marked **legacy customer location** with an attribution warning. This cannot establish who captured it or reconstruct overwritten history. New Admin captures are not attributed to the assigned MR's travel.

Click Calculate road estimate after loading the day's captures. Routes API uses the same chronological stops. Distances are estimates between saved stops, not continuous GPS mileage. No migration or database reset is required; deploy the latest code normally.
