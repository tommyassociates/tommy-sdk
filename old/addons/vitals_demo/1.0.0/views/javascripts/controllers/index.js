const IndexController = {
  init (page) {
    console.log('initialize vitals demo addon')
    window.tommy.tplManager.renderInline('vitals_demo__sliderTemplate', null, page.container)

    window.tommy.f7.swiper('.swiper-container', {})

    let lastTapTime = 0
    $$(page.container).click(function(e) {
      const timeDiff = (new Date()).getTime() - lastTapTime
      if (timeDiff < 300)
        window.tommy.app.f7view.router.back()
      lastTapTime = (new Date()).getTime()
    })
  },

  uninit () {
    console.log('uninitialize vitals demo addon')
  }
}

export default IndexController
