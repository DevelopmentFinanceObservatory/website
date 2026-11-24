import {defineField, defineType} from 'sanity'

// A report listed on /insights/publications of the website.
export const publication = defineType({
    name: 'publication',
    title: 'Publication',
    type: 'document',
    fields: [
        defineField({
            name: 'title',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'slug',
            type: 'slug',
            options: {source: 'title', maxLength: 96},
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'byline',
            description: 'The authors or team, as printed under the title.',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'publishedAt',
            title: 'Publication date',
            type: 'date',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'abstract',
            type: 'text',
            rows: 6,
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'reportUrl',
            title: 'Report URL',
            description: 'Where View Report opens. Leave empty until the report is live.',
            type: 'url',
            validation: (rule) => rule.uri({scheme: ['https']}),
        }),
        defineField({
            name: 'cover',
            description: 'The report cover, shown at 280 × 397 px.',
            type: 'image',
            validation: (rule) => rule.required(),
        }),
    ],
    orderings: [
        {
            title: 'Publication date, newest first',
            name: 'publishedAtDesc',
            by: [{field: 'publishedAt', direction: 'desc'}],
        },
    ],
    preview: {
        select: {title: 'title', subtitle: 'publishedAt', media: 'cover'},
    },
})
