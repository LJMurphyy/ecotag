# API: Tag Extraction Pipeline

## Endpoint

`POST /api/tag`

Notes:
- The route is defined as `/tag` in `backend/api/tag.js` and mounted at `/api` by `backend/server.js`.
- Content type should be `multipart/form-data`.

## Request

### Multipart fields

- `image` (required): image file of a clothing tag (`.jpg`, `.jpeg`, `.png` expected).

## Success Response

### `200 OK`

```json
{
  "parsed": {
    "country": "Portugal",
    "materials": [
      { "fiber": "Cotton", "pct": 70 },
      { "fiber": "Polyester", "pct": 30 }
    ],
    "care": {
      "washing": "machine_wash_cold",
      "drying": "line_dry",
      "ironing": "iron_low",
      "dry_cleaning": null
    }
  },
  "emissions": {
    "total_kgco2e": 0,
    "breakdown": {
      "materials": 0,
      "manufacturing": 0,
      "washing": 0,
      "drying": 0,
      "ironing": 0,
      "dry_cleaning": 0
    },
    "assumptions": {
      "weight_kg": 1,
      "origin": "Portugal",
      "washes_lifetime": 48
    }
  }
}
```

## Error Shape

All error responses use this stable shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### `400 Bad Request`

Returned when `image` is missing.

```json
{
  "error": {
    "code": "MISSING_IMAGE",
    "message": "An image file is required in field 'image'."
  }
}
```

### `502 Bad Gateway`

Returned when the AI provider call fails.

```json
{
  "error": {
    "code": "UPSTREAM_ERROR",
    "message": "Failed to analyze image with AI provider."
  }
}
```

### `500 Internal Server Error`

Returned for unexpected non-provider failures.

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Unexpected server error."
  }
}
```
