import API from '../api'

const TaskController = {
  init (page) {
    const task = API.cache['tasks'][page.query.task_fragment_id]
    const $page = $$(page.container)
    const $navbar = $$(page.navbarInnerContainer)

    console.log('init task details', task)
    window.tommy.tplManager.renderInline('tasks__taskDetailsTemplate', task, $page.parent())

    $page.find('.task-menu-popover a').click(function () {
      const command = $$(this).data('command')

      switch (command) {
        case 'add-checklist':
          TaskController.renderChecklist(page)
          break
        case 'add-end-time':
          TaskController.renderDeadline(page)
          break
      }

      window.tommy.app.f7.closeModal()
    })

    // Take title area
    // TODO: make into a reuasble module
    $page.find('.page-content').scroll(e => {
      if (e.target.scrollTop > 100) { $navbar.addClass('with-title') } else { $navbar.removeClass('with-title') }
    })

    // Task status picker
    TaskController.initStatusPicker(page)

    // Task checklist actions
    if (task.data.checklist &&
            task.data.checklist.items) { TaskController.renderChecklist(page) }

    // Task deadline
    if (task.data.deadline) { TaskController.renderDeadline(page) }

    // Task activity
    const myMessagebar = window.tommy.app.f7.messagebar('.messagebar', { maxHeight: 200 })
    $page.find('.add-comment').click(() => {
      TaskController.addActivity(page, 'comment', myMessagebar.value())
      myMessagebar.clear()
    })
    TaskController.renderActivity(page)

    // Task participants
    const $tagSelect = $page.find('.tag-select')
    let participants = []
    if (task.data.participants) { participants = task.data.participants }
    window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', participants, $page)
    window.tommy.tagSelect.initWidget($tagSelect, participants, data => {
      console.log('task participants changed', data)
      task.data.participants = data
      window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', task.data.participants, $page)
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
  },

  invalidate (page) {
    const task = API.cache['tasks'][page.query.task_fragment_id]

    // Page title must be set after animation
    window.tommy.app.setPageTitle(task.name)
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
    const task = API.cache['tasks'][page.query.task_fragment_id]
    const $page = $$(page.container)

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
      // window.tommy.tplManager.renderInline('tasks__taskChecklistTemplate', task.data.checklist.items, $page)
    })
    $input.on('focusin', () => {
      TaskController.enableSave(page)
      // if (!task.data.checklist)
      //     task.data.checklist = {}
      // if (!task.data.checklist.items)
      //     task.data.checklist.items = []
      // task.data.checklist.items.push({
      //     text: $$(this).val(),
      //     complete: false
      // })
      //
      // window.tommy.tplManager.renderInline('tasks__taskChecklistTemplate', task.data.checklist.items, $page)
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
    const task = API.cache['tasks'][page.query.task_fragment_id]
    const $page = $$(page.container)

    window.tommy.tplManager.renderInline('tasks__taskDeadlineTemplate', task.data.deadline, $page)

    const $input = $page.find('input.edit-task-deadline')
    const format = 'dddd, MMM Do YY, h:mm a'
    const picker = window.tommy.util.createDatePicker($input, task.data.deadline, {
      onClose () {
        console.log('closing deadline picker', picker.currentDate)
        task.data.deadline = picker.currentDate
        TaskController.enableSave(page)
      },
      onFormat (date) {
        console.log('format deadline picker', date)
        return window.tommy.util.humanTime(date)
        // task.data.deadline = picker.currentDate
        // TaskController.enableSave(page)
      }
    })

    if (!task.data.deadline) {
      $input.val('')
    }

    $page.on('click', '.remove-deadline', () => {
      // TODO: confirm alert
      delete task.data.deadline
      $page.find('[data-template="tasks__taskDeadlineTemplate"]').html('')
      TaskController.saveTask(page)
    })
  },

  initStatusPicker (page) {
    const task = API.cache['tasks'][page.query.task_fragment_id]
    const STATUS = [
      'Unassigned', 'Assigned', 'Processing', 'Completed', 'Closed', 'Archive Task', 'Cancel'
    ]

    return window.tommy.app.f7.picker({
      input: $$(page.container).find('.task-status-picker'),
      value: [ task.data.status ],
      convertToPopover: false,
      cols: [
        {
          textAlign: 'center',
          values: STATUS
        }
      ],
      onClose (p) {
        const status = p.value[0]
        if (status == task.data.status) { return }
        task.data.status = status
        TaskController.addActivity(page, 'status', `Changed status to ${task.data.status}`)
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
    const task = API.cache['tasks'][page.query.task_fragment_id]
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
    const task = API.cache['tasks'][page.query.task_fragment_id]
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
