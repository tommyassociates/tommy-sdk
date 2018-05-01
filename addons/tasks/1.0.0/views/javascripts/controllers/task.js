import API from '../api'

const TaskController = {
  init (page) {
    let task = API.cache['tasks'][page.query.task_fragment_id]
    const $page = $$(page.container)
    const $navbar = $$(page.navbarInnerContainer)

    console.log('init task details', task)
    window.tommy.tplManager.renderInline('tasks__taskDetailsTemplate', task, $page.parent())

    // let $menuPopover = $page.find('.task-menu-popover')
    $page.find('.task-menu-popover').on('popover:open', () => {
      // BUG: popover shows offscreen on desktop, this fixes it
      $$(window).trigger('resize')
    })

    // const $editTaskName = $page.find('input.edit-task-name')
    $page.find('.task-menu-popover a').click(e => {
      const command = $$(e.target).data('command')

      switch (command) {
        case 'add-checklist':
          TaskController.renderChecklist(page)
          break
        case 'add-end-time':
          TaskController.renderDeadline(page)
          break
        default:
          alert('Unknown command: ' + command)
      }

      window.tommy.app.f7.closeModal('.task-menu-popover')
    })

    // Task title area
    // TODO: make into a reuasble module
    $page.find('.page-content').scroll(e => {
      if (e.target.scrollTop > 100) {
        $navbar.addClass('with-title')
      } else {
        $navbar.removeClass('with-title')
      }
    })

    // Task status picker
    TaskController.initStatusPicker(page)

    // Task checklist actions
    if (task.data.checklist &&
            task.data.checklist.items) { TaskController.renderChecklist(page) }

    // Task deadline
    if (task.end_at) { TaskController.renderDeadline(page) }

    // Task activity
    let myMessagebar = window.tommy.app.f7.messagebar('.messagebar', { maxHeight: 200 })
    $page.find('.add-comment').click(() => {
      TaskController.addActivity(page, 'comment', myMessagebar.value())
      myMessagebar.clear()
    })
    TaskController.renderActivity(page)

    // Task participants
    const $tagSelect = $page.find('.tag-select')
    let participants = []
    if (task.filters) { participants = task.filters }
    console.log('init task participants', participants, $tagSelect.length)
    window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', participants, $page)
    window.tommy.tagSelect.initWidget($tagSelect, participants, data => {
      console.log('task participants changed', data)
      task.filters = data
      window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', task.filters, page.container)
      TaskController.enableSave(page, true)
    })

    // Task name inline editing
    const $editTaskName = $page.find('input.edit-task-name')
    $editTaskName.on('click', () => {
      TaskController.enableEditName(page, true)
    })

    // Task description inline editing
    const $editTaskDescription = $page.find('textarea.edit-task-description')
    $editTaskDescription.on('click', () => {
      TaskController.enableEditDescription(page, true)
    })

    // Save button
    $navbar.find('a.save').on('click', () => {
      TaskController.saveTask(page)
      TaskController.enableSave(page, false)
    })

    TaskController.invalidate(page)
  },

  invalidate (page) {
    const task = API.cache['tasks'][page.query.task_fragment_id]

    // Page title must be set after animation
    // window.tommy.app.setPageTitle(task.name)
    const $navbar = $$(page.navbarInnerContainer)
    $navbar.find('.center').text(task.name)
  },

  renderActivity (page) {
    const task = API.cache['tasks'][page.query.task_fragment_id]
    const $page = $$(page.container)

    let items = []
    if (task.data.activity) { items = task.data.activity }
    window.tommy.tplManager.renderInline('tasks__taskActivityTemplate', items, $page)
  },

  addActivity (page, type, text) {
    const task = API.cache['tasks'][page.query.task_fragment_id]
    API.addTaskActivity(task, type, text)

    TaskController.renderActivity(page)
    TaskController.saveTask(page)
  },

  renderChecklist (page) {
    let task = API.cache['tasks'][page.query.task_fragment_id]
    let $page = $$(page.container)

    let items = []
    if (task.data.checklist &&
            task.data.checklist.items) { items = task.data.checklist.items }
    window.tommy.tplManager.renderInline('tasks__taskChecklistTemplate', items, $page)

    const $input = $page.find('input.add-checklist-item')
    $input.on('focusout', function () {
      const text = $$(this).val()
      if (!text || !text.length) { return }

      if (!task.data.checklist) { task.data.checklist = {} }
      if (!task.data.checklist.items) { task.data.checklist.items = [] }
      task.data.checklist.items.push({
        text,
        complete: false
      })

      TaskController.renderChecklist(page)
    })
    $input.on('focusin', () => {
      TaskController.enableSave(page)
    })
    $page.find('.remove-checklist').click(() => {
      // TODO: confirm alert
      task.data.checklist = {}
      $page.find('[data-template="tasks__taskChecklistTemplate"]').html('')
      TaskController.saveTask(page)
    })
    $page.find('.remove-checklist-item').click(function () {
      const index = parseInt($$(this).parents('li').data('checklist-item'))

      console.log('removing checklist item', index)
      task.data.checklist.items.splice(index, 1)
      TaskController.renderChecklist(page)

      TaskController.enableSave(page)
      // TaskController.saveTask(page)
    })
    $page.find('.checklist-item').click(function () {
      const index = parseInt($$(this).parents('li').data('checklist-item'))
      const isChecked = $$(this).hasClass('checked')

      console.log('toggle checklist item', index)
      if (isChecked) {
        $$(this).removeClass('checked')
        task.data.checklist.items[index].complete = false
      } else {
        $$(this).addClass('checked')
        task.data.checklist.items[index].complete = true
      }

      TaskController.enableSave(page)
      // TaskController.saveTask(page)
    })
  },

  renderDeadline (page) {
    let task = API.cache['tasks'][page.query.task_fragment_id]
    let $page = $$(page.container)

    console.log('render deadline', task.end_at)
    window.tommy.tplManager.renderInline('tasks__taskDeadlineTemplate', task.end_at, $page)

    const $input = $page.find('input.edit-task-deadline')
    const format = 'dddd, MMM Do YY, h:mm a'
    const picker = window.tommy.util.createDatePicker($input, task.end_at, {
      onClose () {
        console.log('closing deadline picker', picker.currentDate)
        task.end_at = picker.currentDate
        TaskController.enableSave(page)
      },
      onFormat (date) {
        console.log('format deadline picker', date)
        return window.tommy.util.humanTime(date)
      }
    })

    if (!task.end_at) {
      $input.val('')
    }

    $page.on('click', '.remove-deadline', () => {
      // TODO: confirm alert
      delete task.end_at
      $page.find('[data-template="tasks__taskDeadlineTemplate"]').html('')
      TaskController.saveTask(page)
    })
  },

  STATUS: [ 'Unassigned', 'Assigned', 'Processing', 'Completed', 'Closed', 'Archive Task', 'Cancel' ],

  translateStatus (status) {
    return window.tommy.i18n.t('status.' + window.tommy.util.underscore(status))
  },

  untranslateStatus (translatedStatus) {
    for (let i = 0; i < TaskController.STATUS.length; i++) {
      if (TaskController.translateStatus(TaskController.STATUS[i]) === translatedStatus)
        return TaskController.STATUS[i]
    }
  },

  translatedStatuses (translatedStatus) {
    const statuses = []
    for (let i = 0; i < TaskController.STATUS.length; i++) {
      statuses.push(TaskController.translateStatus(TaskController.STATUS[i]))
    }
    return statuses
  },

  initStatusPicker (page) {
    let task = API.cache['tasks'][page.query.task_fragment_id]
    const initial = task.status ? TaskController.translateStatus(task.status) : undefined

    return window.tommy.app.f7.picker({
      input: $$(page.container).find('.task-status-picker'),
      value: [ initial ],
      convertToPopover: false,
      cols: [
        {
          textAlign: 'center',
          values: TaskController.translatedStatuses()
        }
      ],
      onClose (p) {
        const translatedStatus = p.value[0]
        const status = TaskController.untranslateStatus(p.value[0])
        if (status == task.status) { return }
        task.status = status
        TaskController.addActivity(page, 'status',
            window.tommy.i18n.t('task.changed_status_to', {status: translatedStatus}))
        TaskController.saveTask(page)
      }
    })
  },

  saveTask (page) {
    const task = API.cache['tasks'][page.query.task_fragment_id]

    console.log('saving task fragment', task)
    API.saveTask(task)
  },

  enableEditName (page, flag) {
    let task = API.cache['tasks'][page.query.task_fragment_id]
    const $page = $$(page.container)
    const $input = $page.find('input.edit-task-name')

    if (flag != false) {
      // $textarea.removeClass('unstyled')
      TaskController.enableSave(page, true)

      $input.on('focusout', () => {
        task.name = $input.val()
        console.log('set task name', task.name)
      })
    }
  },

  enableEditDescription (page, flag) {
    let task = API.cache['tasks'][page.query.task_fragment_id]
    const $page = $$(page.container)
    const $textarea = $page.find('textarea.edit-task-description')

    if (flag != false) {
      // $textarea.removeClass('unstyled')
      TaskController.enableSave(page, true)

      $textarea.on('focusout', () => {
        task.data.description = $textarea.val()
        console.log('set task description', task.data.description)
        TaskController.enableEditDescription(page, false)
      })
    }
  },

  enableSave (page, flag) {
    const $navbar = $$(page.navbarInnerContainer)
    const $save = $navbar.find('a.save')

    if (flag != false) {
      $save.siblings().hide()
      $save.css('display', 'flex') // show()
    } else {
      $save.siblings().css('display', 'flex') // .css('display: flex') // show()
      $save.hide()
    }
  }
}

export default TaskController
