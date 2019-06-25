export default {
  id: 'basics',
  icon: 'basics.svg',
  indexName: "托me's Basic",
  indexDescription: 'Before you can receive bookings you must first complete the 托me Basics Certificate. This certificate includes training on tasks you will perform during bookings and demonstrates the standard that needs to be maintained.',
  pageName: "托me's Basic",
  pageDescription: 'Before you can receive bookings you must first complete the 托me Basics Certificate. This certificate includes training on tasks you will perform during bookings and demonstrates the standard that needs to be maintained.',
  price: 0,
  duration: 3,
  outcome: 'Certificate of Completion',
  valid: 12,
  estimate_data: 300,
  required: [],
  locked: false,
  lessons: [
    {
      id: 'welcome',
      type: 'video',
      video: 'welcome.mp4',
      indexName: 'Welcome',
      indexDescription: 'Introduction to 托me’s Basic and Assistant Nurse training.',
      pageName: 'Welcome',
      pageDescription: `
      An introduction to Tuome Training.<br>
      In this video you will learn:<br>
      - How to train using Tuome.<br>
      - The progressive steps involved<br>
      `,
      videoLength: 45,
      minimumStay: 45,
    },
    {
      id: 'hand-hygiene',
      type: 'video',
      video: 'hand-hygiene.mp4',
      indexName: 'Hand Hygiene',
      indexDescription: '',
      pageName: 'Hand Hygiene',
      pageDescription: `
      The transfer of bacteria/germs is most often not though air but though direct skin contact.
      Ensuring you maintain good hand hygiene reduces the risk you will contract something or carry it to another.
      Learn the correct technique to ensure your hands are clear and free from germs and the times you should pay attention to clean your hands.
      `,
      videoLength: 69,
      minimumStay: 69,
    },
    {
      id: 'hand-hygiene-quiz',
      type: 'quiz',
      indexName: 'Quiz',
      indexDescription: '',
      pageName: 'Hand Hygiene Quiz',
      pageDescription: `
      Please select the best word for the sentence:
      `,
      questions: [
        {
          question: 'There are $$$ times you should clean your hands.',
          options: [
            'Many',
            'One',
            'Two',
            'Three',
            'Five',
            'Scheduled',
          ],
          wrongText: 'Incorrect. There are five times that you should clean your hands. Please watch video again.',
          correct: 'Five',
        },
      ],
    },
  ],
};
