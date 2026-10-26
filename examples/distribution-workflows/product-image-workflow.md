# Product-image editing workflow for creators

This is the media step of a brief/form → automation → result workflow. It can sit behind
an existing Lovable UI or n8n flow without building another web application.

## Input contract

- One product photo the operator has permission to process.
- One short instruction describing the setting or lighting change.
- Uploaded `image_file_paths`, not a local path or an unrelated vendor's prediction ID.
- A chosen model/resolution and a maximum attempt budget set by the operator.

Copy `requests/edit.json`, replace its placeholder asset path, and run:

```sh
node run.mjs edit receipts/product-edit.json requests/edit.json
```

Map `client.submit('edit', body)` and `client.get(receipt)` to the equivalent create and
status actions in the existing automation. A repeat execution of the same business row
must first check its stored project ID; use a new receipt path only for a deliberate new attempt.

## Compare usable outputs

Keep the input photo and brief fixed. Review the product's shape, logo and label text,
pack size, number of items, hands/contact points, shadows, background edges and requested
composition. Record the selected model, attempts, final charge and accepted/rejected result.
Do not describe a fixture, a mockup or a technically complete generation as a validated ad.

The output requires approval. Do not invent customer testimonials or imply a generated
presenter actually used the product. Store approved media in the creator's own durable
storage before publishing.
