/**
 * STUDIO_ROUTING_ENABLED is the switch for Get Data's opt-in to the search
 * API's Studio router. It is off unless set to `true`, `1`, `on` or `yes`, so
 * a search API without `studio_routing` never receives the field. Set it on
 * in an environment only after the API that serves `studio_routing` is live
 * there, and turn it off before rolling the API back past that change.
 */
export const studioRoutingEnabled = (): boolean =>
    ['true', '1', 'on', 'yes'].includes(
        process.env.STUDIO_ROUTING_ENABLED?.trim().toLowerCase() ?? '',
    );

/** Whether a raw-text run sends `studio_routing`: the setting is on and the
 *  URL does not hold `routing=off`. */
export const optsIntoStudioRouting = ({
    enabled,
    routingOff,
}: {
    enabled: boolean;
    routingOff: boolean;
}): boolean => enabled && !routingOff;
