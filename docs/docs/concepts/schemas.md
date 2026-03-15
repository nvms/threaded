# Schemas

Force structured JSON output from models.

## Basic Usage

```javascript
import { model } from "@threaded/ai";

const workflow = model({
  schema: {
    name: "user_info",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
        interests: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["name", "age"],
    },
  },
});

const result = await workflow("i'm john, 25, into hiking and photography");
const parsed = JSON.parse(result.lastResponse.content);
```

Model output is guaranteed to match the schema.

## With Zod

Use Zod for type-safe schemas.

```javascript
import { z } from "zod";
import { model } from "@threaded/ai";

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  interests: z.array(z.string()),
});

const workflow = model({
  schema: UserSchema,
});

const result = await workflow("i'm sarah, 30, love cooking and traveling");
const user = JSON.parse(result.lastResponse.content);
```

Zod schemas are automatically converted to JSON Schema.

## Extraction Example

```javascript
import { z } from "zod";

const EventSchema = z.object({
  title: z.string(),
  date: z.string(),
  location: z.string().optional(),
  attendees: z.array(z.string()),
});

const workflow = model({
  system: "extract event information from user messages",
  schema: EventSchema,
});

const result = await workflow(
  "team standup tomorrow at 10am in conference room a with alice, bob, and charlie"
);

console.log(result.lastResponse.content);
```

Output:

```json
{
  "title": "team standup",
  "date": "tomorrow at 10am",
  "location": "conference room a",
  "attendees": ["alice", "bob", "charlie"]
}
```

## Classification Example

```javascript
const CategorySchema = z.object({
  category: z.enum(["technical", "billing", "feature_request", "bug"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});

const workflow = model({
  system: "classify customer support messages",
  schema: CategorySchema,
});

const result = await workflow(
  "my api calls keep timing out and it's blocking production!"
);
```

Output:

```json
{
  "category": "bug",
  "priority": "urgent",
  "sentiment": "negative"
}
```

## Nested Objects

```javascript
const OrderSchema = z.object({
  orderId: z.string(),
  customer: z.object({
    name: z.string(),
    email: z.string(),
  }),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      price: z.number(),
    })
  ),
  total: z.number(),
});

const workflow = model({
  schema: OrderSchema,
});
```

Handles complex nested structures.

next: [mcp integration](../advanced/mcp.md)
