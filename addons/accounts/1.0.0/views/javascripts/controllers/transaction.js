import API from '../api'

const TransactionController = {
  init (page) {
    let transaction = API.cache['transactions'][page.query.transaction_fragment_id]
    const $page = $$(page.container)
    const $navbar = $$(page.navbarInnerContainer)

    const f7 = window.tommy.app.f7;

    console.log('init transaction details', transaction)
    window.tommy.tplManager.renderInline('accounts__transactionDetailsTemplate', transaction, $page.parent())


    $page.find('.transaction-menu-popover').on('popover:open', () => {
      // BUG: popover shows offscreen on desktop, this fixes it
      $$(window).trigger('resize')
    })

    $page.find('.transaction-menu-popover a').click(e => {
      const command = $$(e.target).data('command')

      switch (command) {
        case 'add-checklist':
          TransactionController.renderChecklist(page)
          break
        case 'add-end-time':
          TransactionController.renderDeadline(page)
          break
        default:
          alert('Unknown command: ' + command)
      }

      f7.closeModal('.transaction-menu-popover')
    })

    // Transaction title area
    // TODO: make into a reuasble module
    $page.find('.page-content').scroll(e => {
      if (e.target.scrollTop > 100) {
        $navbar.addClass('with-title')
      } else {
        $navbar.removeClass('with-title')
      }
    })

    // Transaction status picker
    TransactionController.initStatusPicker(page)

    // Transaction checklist actions
    if (transaction.data.checklist &&
            transaction.data.checklist.items) { TransactionController.renderChecklist(page) }

    // Transaction deadline
    if (transaction.end_at) { TransactionController.renderDeadline(page) }

    // Transaction activity
    let myMessagebar = f7.messagebar('.messagebar', { maxHeight: 200 })
    myMessagebar.textarea.on('change input', (e) => {
      const value = myMessagebar.value().trim();
      if (value) myMessagebar.textarea.addClass('with-value');
      else myMessagebar.textarea.removeClass('with-value');
    })
    $page.find('.add-comment').click(() => {
      const value = myMessagebar.value().trim();
      if (!value) return;
      TransactionController.addActivity(page, 'comment', myMessagebar.value())
      myMessagebar.clear()
    })
    TransactionController.renderActivity(page)

    // Transaction participants
    const $tagSelect = $page.find('.tag-select')
    let participants = []
    if (transaction.filters) { participants = transaction.filters }
    console.log('init transaction participants', participants, $tagSelect.length)
    window.tommy.tplManager.renderInline('accounts__transactionParticipantsTemplate', participants, $page)
    window.tommy.tagSelect.initWidget($tagSelect, participants, data => {
      console.log('transaction participants changed', data)
      transaction.filters = data
      window.tommy.tplManager.renderInline('accounts__transactionParticipantsTemplate', transaction.filters, page.container)
      TransactionController.saveTransaction(page);
    })

    // Transaction name inline editing
    const $editTransactionName = $page.find('textarea.edit-transaction-name')
    $editTransactionName.on('focus', () => {
      TransactionController.enableEditName(page, true)
    })
    f7.resizableTextarea('textarea.edit-transaction-name');
    f7.resizeTextarea('textarea.edit-transaction-name');

    // Transaction description inline editing
    const $editTransactionDescription = $page.find('textarea.edit-transaction-description')
    $editTransactionDescription.on('focus', () => {
      TransactionController.enableEditDescription(page, true)
    })
    f7.resizableTextarea('textarea.edit-transaction-description');
    f7.resizeTextarea('textarea.edit-transaction-description');

    // Save button
    $navbar.find('a.save').on('click', () => {
      TransactionController.saveTransaction(page)
      TransactionController.enableSave(page, false)
    })

    TransactionController.invalidate(page)
  },

  invalidate (page) {
    const transaction = API.cache['transactions'][page.query.transaction_fragment_id]

    // Page title must be set after animation
    // window.tommy.app.setPageTitle(transaction.name)
    const $navbar = $$(page.navbarInnerContainer)
    $navbar.find('.center').text(transaction.name)
  },

  renderActivity (page) {
    const transaction = API.cache['transactions'][page.query.transaction_fragment_id]
    const $page = $$(page.container)

    let items = []
    if (transaction.data.activity) { items = transaction.data.activity }
    window.tommy.tplManager.renderInline('accounts__transactionActivityTemplate', items, $page)
  },

  addActivity (page, type, text) {
    const transaction = API.cache['transactions'][page.query.transaction_fragment_id]
    API.addTransactionActivity(transaction, type, text)

    TransactionController.renderActivity(page)
    TransactionController.saveTransaction(page)
  },

  renderChecklist (page) {
    let transaction = API.cache['transactions'][page.query.transaction_fragment_id]
    const $page = $$(page.container)

    let items = []
    if (transaction.data.checklist && transaction.data.checklist.items) {
      items = transaction.data.checklist.items
    }
    window.tommy.tplManager.renderInline('accounts__transactionChecklistTemplate', items, $page)

    const $input = $page.find('input.add-checklist-item')
    $input.on('blur', function () {
      const text = $$(this).val()
      transaction = API.cache['transactions'][page.query.transaction_fragment_id]
      if (!text || !text.length) { return }

      if (!transaction.data.checklist) { transaction.data.checklist = {} }
      if (!transaction.data.checklist.items) { transaction.data.checklist.items = [] }
      transaction.data.checklist.items.push({
        text,
        complete: false
      })
      TransactionController.renderChecklist(page)
      TransactionController.saveTransaction(page);
    })
    $page.find('.remove-checklist').click(() => {
      transaction = API.cache['transactions'][page.query.transaction_fragment_id]
      // TODO: confirm alert
      transaction.data.checklist = {}
      $page.find('[data-template="accounts__transactionChecklistTemplate"]').html('')
      TransactionController.saveTransaction(page)
    })
    $page.find('.remove-checklist-item').click(function () {
      transaction = API.cache['transactions'][page.query.transaction_fragment_id]
      const index = parseInt($$(this).parents('li').data('checklist-item'))

      console.log('removing checklist item', index)
      transaction.data.checklist.items.splice(index, 1)
      TransactionController.renderChecklist(page)

      TransactionController.saveTransaction(page)
    })
    $page.find('.checklist-item').click(function (e) {
      const $target = $$(e.target);
      if ($target.hasClass('remove-checklist-item') || $target.parents('.remove-checklist-item').length) {
        return;
      }
      const index = parseInt($$(this).parents('li').data('checklist-item'))
      const isChecked = $$(this).hasClass('checked')
      transaction = API.cache['transactions'][page.query.transaction_fragment_id]
      console.log('toggle checklist item', index)
      if (isChecked) {
        $$(this).removeClass('checked')
        transaction.data.checklist.items[index].complete = false
      } else {
        $$(this).addClass('checked')
        transaction.data.checklist.items[index].complete = true
      }

      TransactionController.saveTransaction(page)
    })
  },

  renderDeadline (page) {
    let transaction = API.cache['transactions'][page.query.transaction_fragment_id]
    let $page = $$(page.container)

    console.log('render deadline', transaction.end_at)
    window.tommy.tplManager.renderInline('accounts__transactionDeadlineTemplate', transaction.end_at, $page)

    const $input = $page.find('input.edit-transaction-deadline')
    const format = 'dddd, MMM Do YY, h:mm a'
    const picker = window.tommy.util.createDatePicker($input, transaction.end_at, {
      onClose () {
        console.log('closing deadline picker', picker.currentDate)
        transaction.end_at = new Date(picker.currentDate).toJSON();

        TransactionController.saveTransaction(page);
      },
      onFormat (date) {
        console.log('format deadline picker', date)
        return window.tommy.util.humanTime(date)
      }
    })

    if (!transaction.end_at) {
      $input.val('')
    }

    $page.on('click', '.remove-deadline', () => {
      // TODO: confirm alert
      delete transaction.end_at
      $page.find('[data-template="accounts__transactionDeadlineTemplate"]').html('')
      TransactionController.saveTransaction(page)
    })
  },

  initStatusPicker (page) {
    let transaction = API.cache['transactions'][page.query.transaction_fragment_id]
    let initial = transaction.status === 'Unassigned' ?
      window.tommy.i18n.t('transaction.waiting_for_assignments') :
      API.translateStatus(transaction.status)

    return window.tommy.app.f7.picker({
      input: $$(page.container).find('.transaction-status-picker'),
      value: [ initial ],
      convertToPopover: false,
      cols: [
        {
          textAlign: 'center',
          values: API.translatedStatuses()
        }
      ],
      onClose (p) {
        const translatedStatus = p.value[0]
        const status = API.untranslateStatus(p.value[0])
        if (status == transaction.status) { return }
        transaction.status = status
        TransactionController.addActivity(page, 'status',
            window.tommy.i18n.t('transaction.changed_status_to', {status: translatedStatus}))
        TransactionController.saveTransaction(page)
      }
    })
  },

  saveTransaction (page) {
    const transaction = API.cache['transactions'][page.query.transaction_fragment_id]

    console.log('saving transaction fragment', transaction)
    API.saveTransaction(transaction)
  },

  enableEditName (page, flag) {
    let transaction = API.cache['transactions'][page.query.transaction_fragment_id]
    const $page = $$(page.container)
    const $textarea = $page.find('textarea.edit-transaction-name')

    if (flag != false) {
      $textarea.once('focusout', () => {
        const newValue = $textarea.val();
        if (transaction.name !== newValue) {
          transaction.name = newValue;
          TransactionController.saveTransaction(page);
          console.log('set transaction name', transaction.name)
        }
      })
    }
  },

  enableEditDescription (page, flag) {
    let transaction = API.cache['transactions'][page.query.transaction_fragment_id]
    const $page = $$(page.container)
    const $textarea = $page.find('textarea.edit-transaction-description')

    if (flag != false) {
      $textarea.once('focusout', () => {
        const newValue = $textarea.val();
        if (transaction.data.description !== newValue) {
          transaction.data.description = newValue;
          TransactionController.saveTransaction(page);
          console.log('set transaction description', transaction.data.description)
        }
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

export default TransactionController
