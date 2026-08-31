import type { components } from "@/generated/api";

/**
 * The contract's own types, named once.
 *
 * <p>Generated from META-INF/openapi.yaml on every build and never committed:
 * a checked-in copy is a second statement of the contract that can drift from
 * the first. Change the document and this file's meaning changes with it -
 * change a field and the pages stop compiling, which is the only drift check
 * a client needs.
 */
type S = components["schemas"];

export type CurrentMember = S["CurrentMemberView"];
export type AppointmentView = S["AppointmentView"];
export type AppointmentPage = S["AppointmentPage"];
export type AppointmentCreated = S["AppointmentCreatedView"];
export type ProviderProfile = S["ProviderProfileView"];
export type BookingPolicy = S["BookingPolicyView"];
export type StaffList = S["StaffList"];
export type StaffView = S["StaffView"];
export type StaffInvitation = S["StaffInvitationView"];
export type OpeningHours = S["OpeningHours"];
export type OpeningHoursSegment = S["OpeningHoursSegment"];
export type ClosureList = S["ClosureList"];
export type ClosureView = S["ClosureView"];
export type ServiceOfferingPage = S["ServiceOfferingPage"];
export type ServiceOffering = S["ServiceOfferingView"];
export type ProviderSummaryPage = S["ProviderSummaryPage"];
export type ProviderSummary = S["ProviderSummary"];
export type PublicProvider = S["PublicProviderView"];
export type PublicOpeningHours = S["PublicOpeningHours"];
export type PublicStaffMember = S["PublicStaffMember"];
export type PublicServiceOffering = S["PublicServiceOffering"];
export type ProviderRegistered = S["ProviderRegisteredView"];
export type JoinedProvider = S["JoinedProviderView"];
export type PublicStaffList = S["PublicStaffList"];
export type AvailableSlotPage = S["AvailableSlotPage"];
export type CustomerBooking = S["CustomerBookingView"];
export type CategoryList = S["CategoryList"];
export type Money = S["Money"];
