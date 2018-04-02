const Fixtures = {
  create () {
    window.tommy.api.createFragment({
      addon: 'tasks',
      kind: 'TaskList',
      name: 'TODO'
    }).then(list => {
      console.log('FIXTURES: created task list', list)
      for (let i = 0; i < 3; i++) {
        window.tommy.api.createFragment({
          parent_id: list.id,
          addon: 'tasks',
          kind: 'Task',
          name: `Task ${i}`,
          time: moment().format(),
          data: {
                        // end_time: moment().format()
          }
        }).then(task => {
          console.log('FIXTURES: created task', task)
        })
      }
    })
  }
}

// Fixtures.create()

export default Fixtures
