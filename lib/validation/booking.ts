import { z } from "zod";

import { isValidTimeZone } from "@/lib/datetime";

export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const timeZone = z.string().refine(isValidTimeZone, "Unknown time zone");

/** GET /api/slots query. */
export const slotsQuerySchema = z.object({
  provider: z.uuid(),
  service: z.uuid(),
  date: dateKey,
  tz: timeZone,
});

/** bookSlot() input. The price is deliberately not here: the database takes it from the service. */
export const bookSlotSchema = z.object({
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
});

export const cancelBookingSchema = z.object({ bookingId: z.uuid() });
