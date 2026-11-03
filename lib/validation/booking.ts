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

/** rescheduleBooking() input: the booking and its new start; the length comes from the booking. */
export const rescheduleBookingSchema = z.object({
  bookingId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
});

/** Free times for moving a booking: one calendar day in the viewer's time zone. */
export const rescheduleSlotsSchema = z.object({
  bookingId: z.uuid(),
  date: dateKey,
  tz: timeZone,
});
