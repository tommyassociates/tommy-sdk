export default {
  id: 'basics', // every course must have unique id
  icon: 'basics.svg', // name of icon file in ../assets/courses-icons/ folder
  indexName: '托me岗前培训',
  indexDescription: '在你接单前，必须先完成托me岗前培训培训获得上岗证。这项培训包括每项服务内容的培训，并提供了服务需要达到的标准。',
  pageName: '托me岗前培训',
  pageDescription: '在你接单前，必须先完成托me岗前培训培训获得上岗证。这项培训包括每项服务内容的培训，并提供了服务需要达到的标准。',
  price: 0, // 0 if free
  duration: 1, // hours
  outcome: '托me上岗证',
  valid: 6, // months
  estimate_data: 250, // mb
  required: [], // ids of required courses
  locked: false,
  lessons: [
    {
      id: 'pre-service', // every lesson must have unique id
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/1-pre-service.mp4',
      /* or in case of internet video, specify "video" prop
      videoUrl: '桌面清洁(Table Cleaning).mp4' // video file name in ../assets/courses-videos/ folder
      */
      indexName: '托me护工准备工作',
      indexDescription: '通过本视频的学习后，托me护工上门前，需做到工作服干净整洁；工具齐备无破损并核对自己手机的订单时间和地址。到客户家里后开始工作前，需跟老人确认服务内容及时间并打开手机订单的开始按钮。',
      pageName: '托me护工准备工作',
      pageDescription: `
      通过本视频的学习后，托me护工上门前，需做到工作服干净整洁；工具齐备无破损并核对自己手机的订单时间和地址。到客户家里后开始工作前，需跟老人确认服务内容及时间并打开手机订单的开始按钮。
      `,
      videoLength: 180, // in seconds
      minimumStay: 90, // in seconds
    },
    {
      id: 'pre-service-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '桌面清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          // $$$ will be replaced with placeholder for answer text
          question: '托me护工上门前，需检查$$$。',
          options: [
            '工作服和工具包',
            '工具车',
            '手机',
          ],
          wrongText: '错误选项,请重新观看视频。',
          correct: '工作服和工具包',
        },
        {
          // $$$ will be replaced with placeholder for answer text
          question: '托me到老人家里后开始工作前，需跟老人确认$$$。',
          options: [
            '身体状况',
            '服务内容及时间',
            '有没有吃饭',
          ],
          wrongText: '错误选项,请重新观看视频。',
          correct: '服务内容及时间',
        },
      ],
    },
    {
      id: 'table-cleaning', // every lesson must have unique id
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/2-table-cleaning.mp4',
      /* or in case of internet video, specify "video" prop
      videoUrl: '桌面清洁(Table Cleaning).mp4' // video file name in ../assets/courses-videos/ folder
      */
      indexName: '桌面清洁',
      indexDescription: '',
      pageName: '桌面清洁',
      pageDescription: `
      通过本视频的学习后，托me护工会使用澳大利亚的精油对桌面进行杀菌和消毒，做到桌面洁净无异味。
      `,
      videoLength: 115, // in seconds
      minimumStay: 60, // in seconds
    },
    {
      id: 'table-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '桌面清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          // $$$ will be replaced with placeholder for answer text
          question: '澳大利亚的精油对桌面有[]和消毒作用。',
          options: [
            '清洁',
            '杀菌',
            '去味',
          ],
          wrongText: '错误选项,请重新观看视频。',
          correct: '杀菌',
        },
        {
          // $$$ will be replaced with placeholder for answer text
          question: '澳大利亚的桌面精油需要在桌面喷洒$$$。',
          options: [
            '2-3下',
            '7-10下',
            '10下以上',
          ],
          wrongText: '错误选项,请重新观看视频。',
          correct: '2-3下',
        },
      ],
    },
    {
      id: 'floor-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/3-floor-cleaning.mp4',
      indexName: '地面清洁',
      indexDescription: '',
      pageName: '地面清洁',
      pageDescription: `

      `,
      videoLength: 114,
      minimumStay: 60,
    },
    {
      id: 'floor-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '地面清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '清洗后的拖把用甩干桶甩干$$$次。',
          options: [
            '8-10',
            '3-5',
            '1-2',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '8-10',
        },
      ],
    },
    {
      id: 'change-bedding',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/4-change-the-bedding.mp4',
      indexName: '床品更换清洗',
      indexDescription: '',
      pageName: '床品更换清洗',
      pageDescription: `

      `,
      videoLength: 4 * 50 + 53,
      minimumStay: 150,
    },
    {
      id: 'change-bedding-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '床品更换清洗测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '撤走使用过的床上用品时，应检查是否有明显污渍，如发现在污渍处$$$。',
          options: [
            '记号笔画圈',
            '打结示意',
            '不用特别处理',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '打结示意',
        },
        {
          question: '更换新的床上用品顺序铺床单、$$$、套枕头。',
          options: [
            '入被套',
            '铺褥子',
            '盖床罩',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '铺褥子',
        },
      ],
    },
    {
      id: 'window-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/5-window-cleaning.mp4',
      indexName: '窗户清洁',
      indexDescription: '',
      pageName: '窗户清洁',
      pageDescription: `

      `,
      videoLength: 240, // in seconds
      minimumStay: 120, // in seconds
    },
    {
      id: 'window-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '窗户清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '将双层玻璃擦的绳索固定在手指和$$$，以防高空坠物。',
          options: [
            '手臂',
            '腰部',
            '手腕',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '手腕',
        },
        {
          question: '先将$$$的玻璃擦固定在玻璃上，再缓慢移动外侧玻璃擦。避免造成夹伤手指和损坏玻璃。',
          options: [
            '内侧',
            '上面',
            '下面',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '内侧',
        },
      ],
    },
    {
      id: 'basin-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/6-basin-cleaning.mp4',
      indexName: '台盆清洁',
      indexDescription: '',
      pageName: '台盆清洁',
      pageDescription: `

      `,
      videoLength: 180,
      minimumStay: 90,
    },
    {
      id: 'basin-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '台盆清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '清洁台面时，如有物品，需将物品$$$擦拭后再放回原位。',
          options: [
            '随意放置',
            '轻轻移开',
            '不去移动',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '轻轻移开',
        },
      ],
    },
    {
      id: 'toilet-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/7-toilet-cleaning.mp4',
      indexName: '马桶清洁',
      indexDescription: '',
      pageName: '马桶清洁',
      pageDescription: `

      `,
      videoLength: 240,
      minimumStay: 120,
    },
    {
      id: 'toilet-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '马桶清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '马桶清洁时需穿好$$$，戴好一次性手套和长袖手套。',
          options: [
            '袖套',
            '围裙',
            '不用穿其他',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '围裙',
        },
        {
          question: '马桶内用马桶刷刷过后残留的水渍及污渍，用$$$清洁。',
          options: [
            '抹布',
            '餐巾纸',
            '专用海绵块',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '专用海绵块',
        },
      ],
    },
    {
      id: 'shower-room-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/8-shower-room-cleaning.mp4',
      indexName: '淋浴房清洁',
      indexDescription: '',
      pageName: '淋浴房清洁',
      pageDescription: `

      `,
      videoLength: 240,
      minimumStay: 120,
    },
    {
      id: 'shower-room-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '淋浴房清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '淋浴房玻璃和[]，用清水冲一次，用玻璃刮刀刮一次，做到无污渍和水渍。',
          options: [
            '墙面',
            '花洒',
            '龙头',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '墙面',
        },
      ],
    },
    {
      id: 'bathtub-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/9-bathtub-cleaning.mp4',
      indexName: '浴缸清洁',
      indexDescription: '',
      pageName: '浴缸清洁',
      pageDescription: `

      `,
      videoLength: 202,
      minimumStay: 100,
    },
    {
      id: 'bathtub-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '浴缸清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '用专用海绵块擦浴缸的龙头和$$$。',
          options: [
            '花洒',
            '外侧',
            '周围地面',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '花洒',
        },
      ],
    },
    {
      id: 'kitchen-countertop-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/10-kitchen-countertop-cleaning.mp4',
      indexName: '厨房台面清洁',
      indexDescription: '',
      pageName: '厨房台面清洁',
      pageDescription: `

      `,
      videoLength: 85,
      minimumStay: 60,
    },
    {
      id: 'kitchen-countertop-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '厨房台面清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '清洁厨房台面先移除不必要的杂物和$$$。',
          options: [
            '食物',
            '餐具',
            '电器',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '电器',
        },
      ],
    },
    {
      id: 'stove-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/11-stove-cleaning.mp4',
      indexName: '灶具清洁',
      indexDescription: '',
      pageName: '灶具清洁',
      pageDescription: `

      `,
      videoLength: 180,
      minimumStay: 90,
    },
    {
      id: 'stove-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '灶具清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '擦拭点火开关时要注意，不要$$$灶具。',
          options: [
            '点燃',
            '划伤',
            '触碰',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '点燃',
        },
      ],
    },
    {
      id: 'fridge-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/12-fridge-cleaning.mp4',
      indexName: '冰箱清洁',
      indexDescription: '',
      pageName: '冰箱清洁',
      pageDescription: `

      `,
      videoLength: 110,
      minimumStay: 60,
    },
    {
      id: 'fridge-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '冰箱清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '冰箱清洁时注意，不要随意触碰冰箱的$$$。',
          options: [
            '冰箱贴',
            '温控按钮',
            '两侧',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '温控按钮',
        },
      ],
    },
    {
      id: 'cooker-hood-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/13-cooker-hood-cleaning.mp4',
      indexName: '油烟机清洁',
      indexDescription: '',
      pageName: '油烟机清洁',
      pageDescription: `

      `,
      videoLength: 262,
      minimumStay: 120,
    },
    {
      id: 'cooker-hood-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '油烟机清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '清洁油烟机戴好袖套和$$$。',
          options: [
            '围裙',
            '一次性手套',
            '长袖手套',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '一次性手套',
        },
      ],
    },
    {
      id: 'tableware-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/14-tableware-cleaning.mp4',
      indexName: '餐具清洁',
      indexDescription: '',
      pageName: '餐具清洁',
      pageDescription: `

      `,
      videoLength: 200,
      minimumStay: 100,
    },
    {
      id: 'tableware-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '餐具清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '将餐具内残留的食物倒入$$$。',
          options: [
            '厨房垃圾桶内',
            '水槽内',
            '窗户外',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '厨房垃圾桶内',
        },
        {
          question: '洗洁精清洗后的餐具，用$$$冲洗，做到无洗洁精残留。',
          options: [
            '水盆里的水',
            '开水',
            '流水',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '流水',
        },
      ],
    },
    {
      id: 'dusting-training',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/15-dusting-training.mp4',
      indexName: '掸尘培训',
      indexDescription: '',
      pageName: '掸尘培训',
      pageDescription: `

      `,
      videoLength: 40,
      minimumStay: 40,
    },
    {
      id: 'dusting-training-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '掸尘测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '掸尘的时候从$$$慢慢向下。',
          options: [
            '最高处',
            '最左边',
            '最后边',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '最高处',
        },
        {
          question: '如掸尘是客户出现呼吸不顺畅的情况，需要$$$。',
          options: [
            '帮助客户到另一个房间',
            '让客户忍一忍',
            '不去理会',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '帮助客户到另一个房间',
        },
      ],
    },
    {
      id: 'vacuuming-training',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/16-vacuuming-training.mp4',
      indexName: '吸尘培训',
      indexDescription: '',
      pageName: '吸尘培训',
      pageDescription: `

      `,
      videoLength: 200,
      minimumStay: 100,
    },
    {
      id: 'vacuuming-training-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '吸尘测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '天花板吸尘和地面吸尘时，动作要$$$。',
          options: [
            '迅速',
            '使劲',
            '轻缓',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '轻缓',
        },
      ],
    },
    {
      id: 'hand-hygiene',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/17-hand-hygiene.mp4',
      indexName: '手部清洁',
      indexDescription: '',
      pageName: '手部清洁',
      pageDescription: `

      `,
      videoLength: 70,
      minimumStay: 70,
    },
    {
      id: 'hand-hygiene-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '手部清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '手部清洁先用手掌覆盖在手背上，搓擦$$$。',
          options: [
            '手背和指背',
            '手掌和指心',
            '手指缝 ',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '手背和指背',
        },
      ],
    },
    {
      id: 'household-appliance-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/18-household-appliance-cleaning.mp4',
      indexName: '家用电器清洁',
      indexDescription: '',
      pageName: '家用电器清洁',
      pageDescription: `

      `,
      videoLength: 155,
      minimumStay: 90,
    },
    {
      id: 'household-appliance-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '家用电器清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '清洁家用电器前一定要先$$$。',
          options: [
            '关闭电源',
            '打开电源',
            '放好梯子',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '关闭电源',
        },
      ],
    },
    {
      id: 'furniture-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/19-furniture-cleaning.mp4',
      indexName: '家具清洁',
      indexDescription: '',
      pageName: '家具清洁',
      pageDescription: `

      `,
      videoLength: 180,
      minimumStay: 90,
    },
    {
      id: 'furniture-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '家具清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '清水擦拭家具一遍，擦拭$$$㎡清洗一次抹布。',
          options: [
            '2-3',
            '5-8',
            '10',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '5-8',
        },
        {
          question: '擦拭家具的抹布要$$$。',
          options: [
            '不能滴水',
            '浸湿水的',
            '干的',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '不能滴水',
        },
      ],
    },
    {
      id: 'door-cleaning',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/20-door-cleaning.mp4',
      indexName: '门的清洁',
      indexDescription: '',
      pageName: '门的清洁',
      pageDescription: `

      `,
      videoLength: 140,
      minimumStay: 60,
    },
    {
      id: 'door-cleaning-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '门的清洁测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '使用绿色抹布用清水擦门，注意门的$$$一定要擦拭。',
          options: [
            '顶边',
            '底边',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '顶边',
        },
      ],
    },
    {
      id: 'post-service-training',
      type: 'video',
      videoUrl: 'https://tommy-education.s3.cn-north-1.amazonaws.com.cn/Training/1-tuome-certificate/21-post-service-training.mp4',
      indexName: '服务结束培训',
      indexDescription: '',
      pageName: '服务结束培训',
      pageDescription: `

      `,
      videoLength: 100,
      minimumStay: 60,
    },
    {
      id: 'post-service-training-quiz',
      type: 'quiz',
      indexName: '测试',
      indexDescription: '',
      pageName: '服务结束测试',
      pageDescription: `
      请选择最合适的选项
      `,
      questions: [
        {
          question: '检查工具包完成后，与客户示意道别说："再见，$$$!"',
          options: [
            '祝您好心情',
            '下次见',
            '白白',
          ],
          wrongText: '错误选项。请重新观看视频。',
          correct: '祝您好心情',
        },
      ],
    },
  ],
};
