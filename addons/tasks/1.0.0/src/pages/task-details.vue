<template>
  <f7-popup>
    <f7-view :init="false">
      <f7-page id="tasks__task" name="tasks__task" class="tasks-page">
        <f7-navbar noBorder class="text-color-white">
          <tommy-nav-back></tommy-nav-back>
          <f7-nav-title>{{taskName}}</f7-nav-title>
          <f7-nav-right>
            <f7-link popover-open=".task-menu-popover" icon-f7="add"></f7-link>
          </f7-nav-right>
        </f7-navbar>

        <f7-popover class="task-menu-popover">
          <f7-list>
            <f7-list-button popover-close @click="addChecklist">{{$t('tasks.task.checklist', 'Checklist')}}</f7-list-button>
            <f7-list-button popover-close @click="addDeadline">{{$t('tasks.task.deadline', 'Deadline')}}</f7-list-button>
          </f7-list>
        </f7-popover>
        <f7-messagebar
          :placeholder="$t('tasks.task.enter_comment', 'Enter comment')"
          :value="comment"
          @input="comment = $event.target.value"
        >
          <f7-link slot="send-link" @click="addComment" :class="{disabled: comment.trim().length === 0}">{{$t('tasks.task.send', 'Send')}}</f7-link>
        </f7-messagebar>

        <template v-if="task">
          <f7-block class="subheader">
            <h1>
              <textarea @input="task.name = $event.target.value" class="unstyled edit-task-name resizable" :value="task.name" @change="saveTaskName"></textarea>
            </h1>
            <input ref="statusInput" type="text" :value="task.status === 'Unassigned' ? $t('tasks.task.waiting_for_assignments', 'Waiting for assignments') : taskStatus(task.status)" readonly="readonly" class="unstyled task-status-picker" />
          </f7-block>

          <tag-select :tags="task.filters || []" @tagToggle="onTagToggle"></tag-select>

          <f7-list media-list class="list-custom details bottom-0">
            <f7-list-item>
              <img slot="media" :src="`${$addonAssetsUrl}slice19.png`" :srcset="`${$addonAssetsUrl}slice19@2x.png 2x, ${$addonAssetsUrl}slice19.png 3x`">
              <f7-input
                type="textarea"
                class="inline-edit"
                :placeholder="$t('tasks.task.edit_description', 'Edit the description...')"
                clearButton
                :value="task.data.description"
                @input="task.data.description = $event.target.value"
                @change="saveTaskDescription"
                resizable
              ></f7-input>
            </f7-list-item>
          </f7-list>

          <!-- Deadline -->
          <f7-list media-list class="list-custom details top-0 bottom-0" v-show="showDeadline || task.end_at">
            <f7-list-item>
              <img slot="media" :src="`${$addonAssetsUrl}slice13.png`" :srcset="`${$addonAssetsUrl}slice13@2x.png 2x,${$addonAssetsUrl}slice13.png 3x`">
              <div class="item-input-wrap" slot="inner">
                <input ref="deadlineInput" type="text" class="unstyled edit-task-deadline" :placeholder="$t('tasks.task.edit_deadline', 'Edit deadline...')">
              </div>
              <a href="#" class="icon-only remove-deadline" slot="inner" @click="removeDeadline">
                <img :src="`${$addonAssetsUrl}slice12.png`" :srcset="`${$addonAssetsUrl}slice12@2x.png 2x,${$addonAssetsUrl}slice12.png 3x`">
              </a>
            </f7-list-item>
          </f7-list>

          <!-- Checklist -->
          <f7-list media-list class="list-custom checklist top-0" v-if="showChecklist || (task.data.checklist && task.data.checklist.items)">
            <li class="item-content">
              <div class="item-media">
                <img :src="`${$addonAssetsUrl}slice17.png`" :srcset="`${$addonAssetsUrl}slice17@2x.png 2x,${$addonAssetsUrl}slice17.png 3x`">
              </div>
              <div class="item-inner">
                <div>{{$t('tasks.task.checklist', 'Checklist')}}</div>
                <a href="#" class="icon-only remove-checklist" @click="removeChecklist">
                  <img :src="`${$addonAssetsUrl}slice12.png`" :srcset="`${$addonAssetsUrl}slice12@2x.png 2x,${$addonAssetsUrl}slice12.png 3x`">
                </a>
              </div>
            </li>

            <li
              v-for="(item, index) in task.data.checklist.items"
              :key="index"
              @click="toggleChecklistItem(item)"
              class="item-content"
              :class="{'checked': item.complete}"
            >
              <div class="item-media">
                <img v-if="!item.complete" :src="`${$addonAssetsUrl}slice14.png`" :srcset="`${$addonAssetsUrl}slice14@2x.png 2x,${$addonAssetsUrl}slice14.png 3x`">
                <img v-else :src="`${$addonAssetsUrl}slice15.png`" :srcset="`${$addonAssetsUrl}slice15@2x.png 2x,${$addonAssetsUrl}slice15.png 3x`">
              </div>
              <div class="item-inner">
                {{item.text}}
                <a href="#" class="icon-only remove-checklist-item" @click="removeChecklistItem(item)">
                  <img :src="`${$addonAssetsUrl}slice12.png`" :srcset="`${$addonAssetsUrl}slice12@2x.png 2x,${$addonAssetsUrl}slice12.png 3x`">
                </a>
              </div>
            </li>

            <li class="item-content">
              <div class="item-media">
                <img :src="`${$addonAssetsUrl}slice16.png`" :srcset="`${$addonAssetsUrl}slice16@2x.png 2x,${$addonAssetsUrl}slice16.png 3x`">
              </div>
              <div class="item-inner">
                <input style="height: auto" @keypress.enter="addChecklistItem($event.target)" type="text" :placeholder="$t('tasks.task.add_items', 'Add items')">
              </div>
            </li>

          </f7-list>

          <!-- Activity -->
          <f7-list media-list class="list-custom activity no-chevron">
            <f7-list-item divider :title="$t('tasks.task.activity', 'Activity')"></f7-list-item>
            <f7-list-item
              v-for="(item, index) in task.data.activity"
              :key="index"
              :after="humanTime(item.time)"
              :subtitle="item.type === 'comment' ? item.text : undefined"
              :title="item.user_name"
              :link="item.type === 'comment'"
            >
              <img
                v-if="item.type === 'comment'"
                slot="media"
                :src="`${$addonAssetsUrl}slice11.png`"
                :srcset="`${$addonAssetsUrl}slice11@2x.png 2x, ${$addonAssetsUrl}slice11.png 3x`"
              >
              <img
                v-else
                slot="media"
                :src="`${$addonAssetsUrl}slice7.png`"
                :srcset="`${$addonAssetsUrl}slice7@2x.png 2x, ${$addonAssetsUrl}slice7.png 3x`"
              >
              <span v-if="item.type !== 'comment'" slot="title">{{item.text}}</span>
            </f7-list-item>
          </f7-list>
        </template>
      </f7-page>
    </f7-view>
  </f7-popup>
</template>
<script>
  import API from '../api';
  import taskStatus from '../utils/task-status';
  import humanTime from '../utils/human-time';
  import taskStatuses from '../utils/task-statuses';
  import tagSelect from '../components/tag-select.vue';

  export default {
    components: {
      tagSelect,
    },
    props: {
      taskId: [Number, String],
    },
    data() {
      return {
        id: parseInt(this.taskId, 10),
        task: null,
        taskName: null,
        comment: '',
        showDeadline: false,
        showChecklist: false,
      };
    },
    computed: {
      taskTitle() {
        return '';
      },
    },
    beforeDestroy() {
      const self = this;
      if (self.datePicker && self.datePicker.destroy) self.datePicker.destroy();
      if (self.statusPicker && self.statusPicker.destroy) self.statusPicker.destroy();
      self.$$(self.$el).find('.page-content').off('scroll');
    },
    mounted() {
      const self = this;
      API.getTask(self.id).then((task) => {
        self.taskName = task.name;
        if (!task.data) task.data = {};
        self.task = task;
        self.$nextTick(() => {
          self.createDatePicker();
          self.createStatusPicker();
        });
      });
      const $navbarTitleEl = self.$$(self.$el).find('.navbar .title');
      const $pageContentEl = self.$$(self.$el).find('.page-content');
      $pageContentEl.on('scroll', () => {
        if ($pageContentEl[0].scrollTop > 100) {
          $navbarTitleEl.css('opacity', 1);
        } else {
          $navbarTitleEl.css('opacity', 0);
        }
      });
    },
    methods: {
      humanTime,
      taskStatus(status) {
        return taskStatus.call(this, status);
      },
      saveTaskName() {
        const self = this;
        const { taskName, task } = self;
        if (taskName === task.name) return;
        self.taskName = self.task.name;
        self.saveTask();
      },
      saveTaskDescription() {
        const self = this;
        self.saveTask();
      },
      onTagToggle(tag, action) {
        const self = this;
        if (action === 'add') {
          self.task.filters.push(tag);
        } else {
          let indexToRemove;
          self.task.filters.forEach((t, index) => {
            if (t.name === tag.name && t.type === tag.type && t.id === tag.id) {
              indexToRemove = index;
            }
          });
          self.task.filters.splice(indexToRemove, 1);
        }
        self.saveTask();
      },
      addChecklist() {
        const self = this;
        self.showChecklist = true;
        const task = self.task;
        if (!task.data) task.data = {};
        if (!task.data.checklist) task.data.checklist = {};
        if (!task.data.checklist.items) task.data.checklist.items = [];
      },
      removeChecklist() {
        const self = this;
        self.showChecklist = false;
        self.task.data.checklist = {};
        self.saveTask();
      },
      addChecklistItem(input) {
        const self = this;
        const task = self.task;
        const value = input.value.trim();
        if (!value) return;
        if (!task.data) self.$set(self.task, 'data', {});
        if (!task.data.checklist) self.$set(task.data, 'checklist', {});
        if (!task.data.checklist.items) self.$set(task.data.checklist, 'items', []);
        task.data.checklist.items.push({
          complete: false,
          text: value,
        });
        input.value = '';
        input.blur();
        self.saveTask();
        self.$set(self, 'task', self.task);
        self.$set(self.task.data.checklist, 'items', task.data.checklist.items);
        self.$forceUpdate();
      },
      toggleChecklistItem(item) {
        const self = this;
        item.complete = !item.complete;
        self.$set(self.task.data.checklist, 'items', self.task.data.checklist.items);
        self.saveTask();
      },
      removeChecklistItem(item) {
        const self = this;
        self.task.data.checklist.items.splice(self.task.data.checklist.items.indexOf(item), 1);
        self.$set(self.task.data.checklist, 'items', self.task.data.checklist.items);
        self.saveTask();
      },
      addDeadline() {
        const self = this;
        self.showDeadline = true;
      },
      removeDeadline() {
        const self = this;
        self.showDeadline = false;
        const { task } = self;
        if (task.end_at) {
          task.end_at = null;
          // delete task.end_at;
          self.saveTask();
        }
        if (self.$refs.deadlineInput) {
          self.$refs.deadlineInput.value = '';
        }
      },
      addComment() {
        const self = this;
        const comment = self.comment;
        self.comment = '';

        self.addActivity('comment', comment);
      },
      saveTask() {
        const self = this;
        const { task } = self;
        API.saveTask(task);
      },
      addActivity(type, text) {
        const self = this;
        const currentUser = self.$root.user;
        const activity = {
          type,
          text,
          time: new Date(),
          user_id: currentUser.id,
          user_name: currentUser.first_name,
        };
        const task = self.task;
        if (!task.data) { task.data = {}; }
        if (!task.data.activity) { task.data.activity = []; }
        task.data.activity.unshift(activity);
        self.saveTask();
      },
      createStatusPicker() {
        const self = this;
        const { task } = self;
        self.statusPicker = self.$f7.picker.create({
          inputEl: self.$refs.statusInput,
          convertToPopover: false,
          value: [task.status],
          cols: [
            {
              textAlign: 'center',
              values: taskStatuses,
              displayValues: taskStatuses.map(s => self.$t(`tasks.status.${s.toLowerCase().replace(/ /g, '_')}`, { defaultValue: s })),
            },
          ],
          on: {
            close(picker) {
              const translatedStatus = picker.cols[0].displayValue;
              const status = picker.cols[0].value;
              if (status === task.status) {
                return;
              }
              task.status = status;
              self.addActivity('status', self.$t('tasks.task.changed_status_to', { status: translatedStatus }));
            },
          },
        });
      },
      createDatePicker() {
        const self = this;
        const { task } = self;
        let initialDate = task.end_at;
        let wasDateProvided = !!initialDate;
        // Parse the date if a string was provided
        if (typeof initialDate === 'string') {
          initialDate = new Date(initialDate);
        }
        // Initialize an empty start date if none was provided
        let initialValue;
        if (initialDate) {
          initialValue = [
            initialDate.getMonth(),
            initialDate.getDate(),
            initialDate.getFullYear(),
            initialDate.getHours(),
            (initialDate.getMinutes() < 10 ? `0${initialDate.getMinutes()}` : initialDate.getMinutes()),
          ];
        }

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        self.datePicker = self.$f7.picker.create({
          inputEl: self.$refs.deadlineInput,
          rotateEffect: true,
          inputReadOnly: true,
          convertToPopover: false,
          updateValuesOnMomentum: false,
          value: initialValue || undefined,
          routableModals: false,
          formatValue(values, displayValues) {
            const picker = this;
            const str = `${displayValues[0]} ${values[1]}, ${values[2]} ${values[3]}:${values[4]}`;
            const date = new Date(str);

            // Skip if date is invalid
            if (Number.isNaN(date.getTime())) {
              return false;
            }

            // Set the selected date as a public instance member
            picker.currentDate = date;
            return humanTime(date);
          },
          cols: [
            // Months
            {
              values: ('0 1 2 3 4 5 6 7 8 9 10 11').split(' ').map(e => parseInt(e, 10)),
              displayValues: monthNames,
              textAlign: 'left',
            },
            // Days
            {
              values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
            },
            // Years
            {
              values: (() => {
                const year = new Date().getFullYear();
                const arr = [];
                for (let i = year; i <= year + 10; i += 1) { arr.push(i); }
                return arr;
              })(),
            },
            // Space divider
            {
              divider: true,
              content: '  ',
            },
            // Hours
            {
              values: (() => {
                const arr = [];
                for (let i = 0; i <= 23; i += 1) { arr.push(i); }
                return arr;
              })(),
            },
            // Divider
            {
              divider: true,
              content: ':',
            },
            // Minutes
            {
              values: (() => {
                const arr = [];
                for (let i = 0; i <= 59; i += 1) { arr.push(i < 10 ? `0${i}` : i); }
                return arr;
              })(),
            },
          ],
          on: {
            open() {
              const picker = this;
              if (!wasDateProvided) {
                wasDateProvided = true;
                const todayDate = new Date();
                picker.setValue([
                  todayDate.getMonth(),
                  todayDate.getDate(),
                  todayDate.getFullYear(),
                  todayDate.getHours(),
                  (todayDate.getMinutes() < 10 ? `0${todayDate.getMinutes()}` : todayDate.getMinutes()),
                ]);
              }
            },
            close() {
              const picker = this;
              task.end_at = new Date(picker.currentDate).toJSON();
              self.saveTask();
            },
            change(picker, values) {
              const daysInMonth = new Date(picker.value[2], picker.value[0] * 1 + 1, 0).getDate();
              if (values[1] > daysInMonth) {
                picker.cols[1].setValue(daysInMonth);
              }
            },
          },
        });
      },
    },
  };
</script>

