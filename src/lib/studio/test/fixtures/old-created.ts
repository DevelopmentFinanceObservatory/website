/**
 * A `component.created` `payload` in the older `{stored_intent}` shape,
 * trimmed from dfo-ai's recorded transcript
 * https://github.com/ONEcampaign/dfo-ai/blob/32abd086fc9135fd3e9bd04298e0b68fbfad13cf/docs/transcripts/studio_transcript_plan.jsonl
 * (line_chart, cmp_01M16ZY81TEGN056T0EFSYVZ89). It has no envelope. A harness without the
 * resolved revision sends this shape.
 */
export const oldCreated = {
    component_id: 'cmp_01M16ZY81TEGN056T0EFSYVZ89',
    revision: 1,
    catalog_version: '2026.8.0',
    stored_intent: {
        type: 'line_chart',
        title: 'Current Health Expenditure Per Capita in Kenya (2000-2023)',
        select: {
            stat_var:
                'dcid:Amount_EconomicActivity_ExpenditureActivity_HealthcareExpenditure_AsFractionOf_Count_Person',
            observationAbout: 'country/KEN',
        },
        frame_ref: {
            spec_id: 'spec_0002907ee44bf25fc98f343372614a84',
            content_version: 'cv_bec21df8ebf432401c160f10858e61fb',
        },
    },
};
