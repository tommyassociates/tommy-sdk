const Fixtures = {
  create () {
    window.tommy.api.createFragment({
      addon: 'accounts',
      kind: 'TransactionList',
      name: 'TODO'
    }).then(list => {
      console.log('FIXTURES: created transaction list', list)
      for (let i = 0; i < 3; i++) {
        window.tommy.api.createFragment({
          parent_id: list.id,
          addon: 'accounts',
          kind: 'Transaction',
          name: `Transaction ${i}`,
          time: moment().format(),
          data: {
                        // end_time: moment().format()
          }
        }).then(transaction => {
          console.log('FIXTURES: created transaction', transaction)
        })
      }
    })
  }
}

// Fixtures.create()

export default Fixtures
