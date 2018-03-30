// require(['app','api','util','config','tplManager','tagSelect','moment'],
// function (app,api,util,config,tplManager,tagSelect,moment) {


    //
    /// Task API

    var TaskAPI = {
        listsLoaded: false,
        tasksLoaded: false,
        cache: {},

        initCache: function () {
            TaskAPI.cache = {
                lists: {},
                tasks: {}
            }
        },

        addTask: function (item) {
            TaskAPI.cache['tasks'][item.id] = item
            console.log('task added', item)
        },

        addTasks: function (items) {
            TaskAPI.tasksLoaded = true;
            if (items && items.length) {
                for (var i = 0; i < items.length; i++) {
                    TaskAPI.addTask(items[i])
                }
            }
        },

        getListTasks: function (listId) {
            var tasks = [], task
            for (var taskId in TaskAPI.cache['tasks']) {
                task = TaskAPI.cache['tasks'][taskId]
                if (task.parent_id == listId)
                    tasks.push(task)
            }
            return tasks
        },

        loadTasks: function (params) {
            console.log('load tasks', params)

            params = Object.assign({
                addon: 'tasks',
                kind: 'Task'
            }, params)
            return window.tommy.api.getFragments(params).then(TaskAPI.addTasks)
        },

        addTaskActivity: function (task, type, text) {
            var currentUser = config.getCurrentUser()

            var activity = {
                type: type,
                text: text,
                time: new Date,
                user_id: currentUser.id,
                user_name: currentUser.first_name
            }

            if (!task.data)
                task.data = {}
            console.log(task)
            if (!task.data.activity)
                task.data.activity = []
            task.data.activity.unshift(activity)

            return activity
        },

        saveTask: function (task) {
            console.log('save task', task)
            if (!task.name) {
                alert('Task name must be set')
                return
            }
            if (!task.parent_id) {
                alert('Task must belong to a list')
                return
            }

            task.addon = 'tasks'
            task.kind = 'Task'
            if (!task.id)
                TaskAPI.addTaskActivity(task, 'status', 'Created a task')
            var params = Object.assign({}, task, { data: JSON.stringify(task.data) })
            if (task.id)
                return window.tommy.api.updateFragment(task.id, params).then(TaskAPI.addTask)
            else
                return window.tommy.api.createFragment(params).then(TaskAPI.addTask)
        },

        addList: function (item) {
            TaskAPI.cache['lists'][item.id] = item;
            console.log('added task list', item)
        },

        addLists: function (items) {
            TaskAPI.listsLoaded = true;
            if (items && items.length) {
                for (var i = 0; i < items.length; i++) {
                    TaskAPI.addList(items[i])
                }
            }
        },

        loadLists: function (params) {
            console.log('load task lists', params)

            params = Object.assign({
                addon: 'tasks',
                kind: 'TaskList'
            }, params)
            return window.tommy.api.getFragments(params).then(TaskAPI.addLists)
        },

        deleteList: function (listId) {
            delete TaskAPI.cache['lists'][listId]
            console.log('delete list', listId)
            return window.tommy.api.deleteFragment(listId)
        },

        saveList: function (list) {
            console.log('save list', list)
            list.addon = 'tasks'
            list.kind = 'TaskList'
            if (!list.data)
                list.data = {}
            if (typeof(list.data.order) === 'undefined')
                list.data.order = Object.keys(TaskAPI.cache['lists']).length
            if (typeof(list.data.active) === 'undefined')
                list.data.active = true
            if (typeof(list.data.show_fast_add) === 'undefined')
                list.data.show_fast_add = true
            var params = Object.assign({}, list, { data: JSON.stringify(list.data) })
            if (list.id)
                return window.tommy.api.updateFragment(list.id, params).then(TaskAPI.addList)
            else
                return window.tommy.api.createFragment(params).then(TaskAPI.addList)
            Index.invalidateLists = true // rerender lists
        }
    }


    //
    /// Index View

    var Index = {
        init: function (page) {
            if (!TaskAPI.listsLoaded || !TaskAPI.tasksLoaded) {
                TaskAPI.initCache()
                TaskAPI.loadLists().then(function() {
                    Index.invalidate(page)
                })
                TaskAPI.loadTasks().then(function() {
                    Index.invalidate(page)
                })
            }

            // Index.invalidate(page)
            Index.bind(page)
        },

        uninit: function () {
            console.log('tasks uninitialize')
            TaskAPI.cache = {}
        },

        bind: function (page) {
            var $page = $$(page.container)
            $page.find('.list-content').each(function() {
                var $el = $$(this)
                if ($el[0].scrollHeight >= $el[0].clientHeight)
                    $el.parent().addClass('hasScroll')
            })
            $page.on('click', '.fast-add-toggle', function() {
                var $el = $$(this),
                    $panel = $el.closest('.in').removeClass('in').siblings().addClass('in')
                if ($el.data('input-focus'))
                    $panel.find('input').focus()
            })
            $page.on('submit', 'form.fast-add-form', function(ev) {
                // var $el = $$(this)
                ev.preventDefault()
                var data = window.tommy.app.f7.formToJSON(this)
                $$(this).find('input[name="name"]').val('')
                TaskAPI.saveTask(data).then(function() {
                    Index.invalidate(page)
                })
            })

        },

        invalidate: function (page) {
            // if (!Index.listsLoaded || !Index.tasksLoaded) return;

            console.log('invalidating tasks index')
            var $page = $$(page.container)
            if (Index.invalidateLists || !$page.find('.card').length) {
                Index.invalidateLists = false
                window.tommy.tplManager.renderInline('tasks__listsTemplate', TaskAPI.cache['lists'], page.container)

                var isTablet = window.innerWidth >= 630
                var swiper = window.tommy.app.f7.swiper('.swiper-container', {
                    centeredSlides: !isTablet,
                    spaceBetween: 0,
                    freeMode: false,
                    freeModeSticky: true,
                    slidesPerView: 'auto'
                })
            }

            for (var listId in TaskAPI.cache['lists']) {
                var $e = $$(page.container).find('[data-list-id="' + listId + '"] .list-content')
                var tasks = TaskAPI.getListTasks(listId)
                window.tommy.tplManager.renderTarget('tasks__listTasksTemplate', tasks, $e)
            }
        }
    }


    //
    /// Task Add Form

    var TaskAddForm = {

        init: function(page) {
            var $page = $$(page.container),
                $nav = $$(page.navbarInnerContainer)

            window.tommy.tplManager.renderInline('tasks__addTaskTemplate', TaskAPI.cache['lists'], $page)

            $nav.find('a.save').on('click', function (ev) {
                var data = window.tommy.app.f7.formToJSON($page.find('form'))
                TaskAddForm.saveTask(data)
                ev.preventDefault()
            })
        },

        saveTask: function(data) {
            // data.addon = 'tasks'
            // data.kind = 'Task'
            // data.parent
            // data.data = {}

            TaskAPI.saveTask(data).then(TaskAddForm.afterSave)
        },

        afterSave: function(res) {
            console.log('task saved', res)
            window.tommy.app.f7view.router.back()
        }
    }


    //
    /// Board Setting Form

    var BoardSettingForm = {

        init: function(page) {
            var $page = $$(page.container),
                $nav = $$(page.navbarInnerContainer)

            // console.log('edit list', list)
            window.tommy.tplManager.renderInline('tasks__boardSettingTemplate', null, $page)

            $nav.find('a.save').on('click', function (ev) {
                var data = window.tommy.app.f7.formToJSON($page.find('form'))
                ev.preventDefault()
            })

            // $page.find('.delete-list').on('click', function (ev) {
            //     TaskAPI.deleteList(list.id)
            //     window.tommy.app.f7view.router.back()
            //     ev.preventDefault()
            // })
        },

        saveList: function() { // list, data
            // list.name = data.name
            // // data.addon = 'tasks'
            // // data.kind = 'TaskList'
            // if (!list.data)
            //     list.data = {}
            // // list.data.show_fast_add = !!(data.show_fast_add && data.show_fast_add.length)
            // console.log('create list', list, data)
            //
            // var params = Object.assign({}, list, { data: JSON.stringify(list.data) })
            // window.tommy.api.createFragment(list.id, params).then(ListAddForm.afterSave)
        },

        afterSave: function(res) {
            // console.log('list saved', res)
            // TaskAPI.addList(res)
            // window.tommy.app.f7view.router.back()
        }
    }


    //
    /// List Add Form

    var ListAddForm = {

        init: function(page) {
            var $page = $$(page.container),
                $nav = $$(page.navbarInnerContainer)

            $nav.find('a.save').on('click', function (ev) {
                var data = window.tommy.app.f7.formToJSON($page.find('form'))
                ListAddForm.saveList(data)
                ev.preventDefault()
            })
        },

        saveList: function(data) {
            var list = {}
            list.name = data.name

            console.log('create list', list, data)
            if (!list.name) {
                alert('List name must be set')
                return;
            }

            TaskAPI.saveList(list).then(ListAddForm.afterSave)
        },

        afterSave: function(res) {
            console.log('list saved', res)
            window.tommy.app.f7view.router.back()
        }
    }


    //
    /// List Edit Form

    var ListEditForm = {

        init: function(page) {
            var list = TaskAPI.cache['lists'][page.query.list_fragment_id],
                $page = $$(page.container),
                $nav = $$(page.navbarInnerContainer)

            console.log('edit list', list)
            window.tommy.tplManager.renderInline('tasks__listEditTemplate', list, $page)

            $nav.find('a.save').on('click', function (ev) {
                var data = window.tommy.app.f7.formToJSON($page.find('form'))
                ListEditForm.saveList(list, data)
                ev.preventDefault()
            })

            $page.find('.delete-list').on('click', function (ev) {
                TaskAPI.deleteList(list.id)
                Index.invalidateLists = true;
                window.tommy.app.f7view.router.back()
                ev.preventDefault()
            })
        },

        saveList: function(list, data) {
            list.name = data.name
            // if (!list.data)
            //     list.data = {}
            list.data.show_fast_add = !!(data.show_fast_add && data.show_fast_add.length)
            // console.log('save list', list, data)

            TaskAPI.saveList(list).then(ListEditForm.afterSave)
        },

        afterSave: function(res) {
            console.log('list saved', res)
            window.tommy.app.f7view.router.back()
        }
    }


    //
    /// List Management Form

    var ListManagementForm = {

        init: function(page) {
            var $page = $$(page.container),
                $nav = $$(page.navbarInnerContainer)

            // console.log('edit list', list)
            window.tommy.tplManager.renderInline('tasks__listManagementTemplate', TaskAPI.cache['lists'], $page)

            $nav.find('a.save').on('click', function (ev) {
                var data = window.tommy.app.f7.formToJSON($page.find('form'))
                ListManagementForm.save(page, data)
                ev.preventDefault()
            })

            // $page.find('sortable').on('sortable:sort',function(event) {
            //   console.log('edit list', list)
            //   // alert("From " + event.detail.startIndex + " to " + event.detail.newIndex)
            // })
            // $page.find('.delete-list').on('click', function (ev) {
            //     TaskAPI.deleteList(list.id)
            //     window.tommy.app.f7view.router.back()
            //     ev.preventDefault()
            // })
        },

        save: function(page, data) {
            var $page = $$(page.container),
                redirected = false

            $page.find('.sortable [data-list-id]').each(function(index) {
                var $this = $$(this)
                var list = TaskAPI.cache['lists'][$this.data('list-id')]
                var active = $this.find('input[type="checkbox"]')[0].checked

                if (list.data.order != index || list.data.active != active) {
                    list.data.order = index
                    list.data.active = active
                    TaskAPI.saveList(list)
                    console.log('updated list', list)

                    if (!redirected) {
                        redirected = true
                        window.tommy.app.f7view.router.back()
                    }
                }
            })
        }
    }


    //
    /// Task Details

    var TaskDetails = {
        init: function (page) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id],
                $page = $$(page.container),
                $navbar = $$(page.navbarInnerContainer)

            console.log('init task details', task)

            // $navbar.find('.center .task-name').val(task.name)
            // window.tommy.app.setPageTitle(task.name)
            window.tommy.tplManager.renderInline('tasks__taskDetailsTemplate', task, $page.parent())

            $page.find('.task-menu-popover a').click(function() {
                var command = $$(this).data('command')

                switch (command) {
                    case 'add-checklist':
                        // $pageContent.addClass('has-checklist')
                        TaskDetails.renderChecklist(page)
                        // TaskDetails.addActivity(page, 'status', 'Added a Checklist')
                        break;
                    case 'add-end-time':
                        // $pageContent.addClass('has-end-time')
                        TaskDetails.renderDeadline(page)
                        // TaskDetails.addActivity(page, 'status', 'Added a Deadline')
                        break;
                }

                window.tommy.app.f7.closeModal()
            })

            // Take title area
            // TODO: make into a reuasble module
            $page.find('.page-content').scroll(function(e) {
               if (e.target.scrollTop > 100)
                   $navbar.addClass('with-title')
               else
                   $navbar.removeClass('with-title')
            })

            // Task status picker
            TaskDetails.initStatusPicker(page)

            // Task checklist actions
            if (task.data.checklist &&
                task.data.checklist.items)
                TaskDetails.renderChecklist(page)

            // Task deadline
            if (task.data.deadline)
                TaskDetails.renderDeadline(page)

            // Task activity
            var myMessagebar = window.tommy.app.f7.messagebar('.messagebar', { maxHeight: 200 })
            $page.find('.add-comment').click(function() {
                TaskDetails.addActivity(page, 'comment', myMessagebar.value())
                myMessagebar.clear()
            })
            TaskDetails.renderActivity(page)

            // Task participants
            var $tagSelect = $page.find('.tag-select')
            var participants = []
            if (task.data.participants)
                participants = task.data.participants
            window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', participants, $page)
            window.tommy.tagSelect.initWidget($tagSelect, participants, function(data) {
                console.log('task participants changed', data)
                task.data.participants = data
                window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', task.data.participants, $page)
                TaskDetails.enableSave(page, true)
            })

            // Task name inline editing
            var $editTaskName = $page.find('input.edit-task-name')
            $editTaskName.on('click', function() {
                TaskDetails.enableEditName(page, true)
            })

            // Task description inline editing
            var $editTaskDescription = $page.find('textarea.edit-task-description')
            $editTaskDescription.on('click', function() {
                TaskDetails.enableEditDescription(page, true)
            })

            // Save button
            $navbar.find('a.save').on('click', function() {
                TaskDetails.saveTask(page)
                TaskDetails.enableSave(page, false)
            })
        },

        invalidate: function (page) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id]

            // Page title must be set after animation
            window.tommy.app.setPageTitle(task.name)
        },

        // Init the checklist
        // initChecklist: function (page) {
        //     var task = TaskAPI.cache['tasks'][page.query.task_fragment_id],
        //         $page = $$(page.container)
        //
        //     if (task.data &&
        //         task.data.checklist &&
        //         task.data.checklist.items)
        //         TaskDetails.renderChecklist(page)
        // },

        // Render an empty or existing checklist
        renderActivity: function (page) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id],
                $page = $$(page.container)

            items = []
            if (task.data.activity)
                items = task.data.activity
            window.tommy.tplManager.renderInline('tasks__taskActivityTemplate', items, $page)
        },

        addActivity: function (page, type, text) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id]//,
            //     currentUser = config.getCurrentUser()
            //
            // var data = {
            //     type: type,
            //     text: text,
            //     time: new Date,
            //     user_id: currentUser.id,
            //     user_name: currentUser.first_name
            // }
            //
            // if (!task.data.activity)
            //     task.data.activity = []
            // task.data.activity.unshift(data)
            TaskAPI.addTaskActivity(task, type, text)

            TaskDetails.renderActivity(page)
            TaskDetails.saveTask(page)
        },

        // Render an empty or existing checklist
        renderChecklist: function (page) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id],
                $page = $$(page.container)

            var items = []
            if (task.data.checklist &&
                task.data.checklist.items)
                items = task.data.checklist.items
            window.tommy.tplManager.renderInline('tasks__taskChecklistTemplate', items, $page)

            var $input = $page.find('input.add-checklist-item')
            $input.on('focusout', function() {
                var text = $$(this).val()
                if (!text || !text.length)
                    return

                if (!task.data.checklist)
                    task.data.checklist = {}
                if (!task.data.checklist.items)
                    task.data.checklist.items = []
                task.data.checklist.items.push({
                    text: text,
                    complete: false
                })

                TaskDetails.renderChecklist(page)
                // window.tommy.tplManager.renderInline('tasks__taskChecklistTemplate', task.data.checklist.items, $page)
            })
            $input.on('focusin', function() {
                TaskDetails.enableSave(page)
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
            $page.find('.remove-checklist').click(function() {

                // TODO: confirm alert
                task.data.checklist = {}
                $page.find('[data-template="tasks__taskChecklistTemplate"]').html('')
                TaskDetails.saveTask(page)
            })
            $page.find('.remove-checklist-item').click(function() {
                var index = parseInt($$(this).parents('li').data('checklist-item'))

                console.log('removing checklist item', index)
                task.data.checklist.items.splice(index, 1)
                TaskDetails.renderChecklist(page)

                TaskDetails.enableSave(page)
                // TaskDetails.saveTask(page)
            })
            $page.find('.checklist-item').click(function() {
                var index = parseInt($$(this).parents('li').data('checklist-item'))
                var isChecked = $$(this).hasClass('checked')

                console.log('toggle checklist item', index)
                if (isChecked) {
                    $$(this).removeClass('checked')
                    task.data.checklist.items[index].complete = false
                }
                else {
                    $$(this).addClass('checked')
                    task.data.checklist.items[index].complete = true
                }

                TaskDetails.enableSave(page)
                // TaskDetails.saveTask(page)
            })
        },

        // Render an empty or existing deadline
        renderDeadline: function (page) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id],
                $page = $$(page.container)

            window.tommy.tplManager.renderInline('tasks__taskDeadlineTemplate', task.data.deadline, $page)

            var $input = $page.find('input.edit-task-deadline')
            var format = "dddd, MMM Do YY, h:mm a"
            var picker = window.tommy.util.createDatePicker($input, task.data.deadline, {
                onClose: function() {
                    console.log('closing deadline picker', picker.currentDate)
                    task.data.deadline = picker.currentDate
                    TaskDetails.enableSave(page)
                },
                onFormat: function(date) {
                    console.log('format deadline picker', date)
                    return window.tommy.util.humanTime(date)
                    // task.data.deadline = picker.currentDate
                    // TaskDetails.enableSave(page)
                }
            })

            if (!task.data.deadline) {
                $input.val('')
            }

            $page.on('click', '.remove-deadline', function() {

                // TODO: confirm alert
                delete task.data.deadline;
                $page.find('[data-template="tasks__taskDeadlineTemplate"]').html('')
                TaskDetails.saveTask(page)
            })
        },

        initStatusPicker: function (page) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id]
            var STATUS = [
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
                onClose:function (p) {
                    var status = p.value[0]
                    if (status == task.data.status)
                        return
                    task.data.status = status
                    TaskDetails.addActivity(page, 'status', 'Changed status to ' + task.data.status)
                    TaskDetails.saveTask(page)
                }
            })
        },

        saveTask: function (page) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id]

            console.log('saving task fragment', task)
            TaskAPI.saveTask(task)
        },

        enableEditName: function (page, flag) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id],
                $page = $$(page.container),
                $input = $page.find('input.edit-task-name')

            if (flag != false) {
                // $textarea.removeClass('unstyled')
                TaskDetails.enableSave(page, true)

                $input.on('focusout', function() {
                    task.name = $input.val()
                    console.log('set task name', task.name)
                })
            }
            // else {
            //     $textarea.addClass('unstyled')
            // }
        },

        enableEditDescription: function (page, flag) {
            var task = TaskAPI.cache['tasks'][page.query.task_fragment_id],
                $page = $$(page.container),
                $textarea = $page.find('textarea.edit-task-description')

            if (flag != false) {
                // $textarea.removeClass('unstyled')
                TaskDetails.enableSave(page, true)

                $textarea.on('focusout', function() {
                    task.data.description = $textarea.val()
                    console.log('set task description', task.data.description)
                    TaskDetails.enableEditDescription(page, false)
                })
            }
            // else {
            //     $textarea.addClass('unstyled')
            // }
        },

        enableSave: function (page, flag) {
            var $navbar = $$(page.navbarInnerContainer),
                $save = $navbar.find('a.save')

            if (flag != false) {
                $save.siblings().hide()
                $save.css('display', 'flex') // show()
            }
            else {
                $save.siblings().css('display', 'flex') // .css('display: flex') // show()
                $save.hide()
            }
        }
    }

    //
    /// Router

    /// Task

    window.tommy.app.f7.onPageInit('tasks__index', Index.init)
    window.tommy.app.f7.onPageBack('tasks__index', Index.uninit)
    window.tommy.app.f7.onPageAfterAnimation('tasks__index', Index.invalidate)

    /// Board Setting Form

    window.tommy.app.f7.onPageInit('tasks__board-setting', BoardSettingForm.init)

    /// List Add Form

    window.tommy.app.f7.onPageInit('tasks__list-add', ListAddForm.init)

    /// List Edit Form

    window.tommy.app.f7.onPageInit('tasks__list-edit', ListEditForm.init)

    /// List Management Form

    window.tommy.app.f7.onPageInit('tasks__list-management', ListManagementForm.init)
    window.tommy.app.f7.onPageAfterAnimation('tasks__list-management', ListManagementForm.init)

    /// Task Form

    window.tommy.app.f7.onPageInit('tasks__task-add', TaskAddForm.init)
    // window.tommy.app.f7.onPageInit('tasks__edit-task', TaskAddForm.init)

    /// Task Details

    window.tommy.app.f7.onPageInit('tasks__task', TaskDetails.init)
    window.tommy.app.f7.onPageAfterAnimation('tasks__task', TaskDetails.invalidate)

    //
    /// Template7 Helpers

    window.tommy.app.t7.registerHelper('tasks__checklistNumCompleted', function (checklist) {
        var ret = ''
        if (checklist && checklist.items) {
            var completed = checklist.items.filter(function(value) {
                return value.complete;
            })
            ret += completed.length
            ret += '/'
            ret += checklist.items.length
        }
        return ret
    })


    //
    /// Fixtures
    //

    var Fixtures = {
        create: function () {
            window.tommy.api.createFragment({
                addon: 'tasks',
                kind: 'TaskList',
                name: 'TODO'
            }).then(function (list) {
                console.log('FIXTURES: created task list', list)
                for (var i = 0; i < 3; i++) {
                    window.tommy.api.createFragment({
                        parent_id: list.id,
                        addon: 'tasks',
                        kind: 'Task',
                        name: 'Task ' + i,
                        time: moment().format(),
                        data: {
                            // end_time: moment().format()
                        }
                    }).then(function (task) {
                        console.log('FIXTURES: created task', task)
                    })
                }
            })
        }
    }

    // Fixtures.create()

    // window.tommy.app.f7.onPageAfterAnimation('*', function(page){
    //     var $page = $$(page.container)
    //     if ($page.hasClass('with-toggle-save')) {
    //         $page.once('input', '.toggle-save', function(){
    //             $$(page.navbarInnerContainer).find('.save').addClass('active')
    //         })
    //     }
    // })
    //
    //
    // // var isTablet = window.innerWidth >= 630,
    // //     swiper;
    //
    // $$(document)
    //     .on('picker:open', function(e){
    //         var $el = $$(e.target)
    //         $el.find('.left').html('Cancel').addClass('close-picker color-gray')
    //         $el.find('.right>.link').addClass('color-custom')
    //     })
    //     .on('popover:open', function(e){
    //         var $el = $$(e.target)
    //         if ($el.hasClass('overlay-hidden')) {
    //             $$('body').addClass('overlay-hidden')
    //             $el.once('popover:close', function(){
    //                 $$('body').removeClass('overlay-hidden')
    //             })
    //         }
    //     })
    //     // .on('click', '.card', function(e){
    //     //     e.preventDefault()
    //     //     if (isTablet) {
    //     //         $$.get(this.href, function(response){
    //     //             window.tommy.app.f7.popup('<div class="popup" id="tasks__task" data-page="task">' + response + '</div>')
    //     //         })
    //     //     } else {
    //     //         view.router.loadPage(window.tommy.util.addonAssetPath('views/task.html'))
    //     //     }
    //     // })

    // window.tommy.app.f7.init()
// })
