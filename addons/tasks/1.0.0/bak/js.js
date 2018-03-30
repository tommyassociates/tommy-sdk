var app = new Framework7({
        init: false
    }),
    $ = Dom7,
    view = app.addView('.view-main', {
        dynamicNavbar: true
    }),
    isTablet = window.innerWidth >= 630,
    swiper;



$(document)
    .on('picker:open', function(e){
        var $el = $(e.target);
        $el.find('.left').html('Cancel').addClass('close-picker color-gray');
        $el.find('.right>.link').addClass('color-custom');
    })
    .on('popover:open', function(e){
        var $el = $(e.target);
        if ($el.hasClass('overlay-hidden')) {
            $('body').addClass('overlay-hidden');
            $el.once('popover:close', function(){
                $('body').removeClass('overlay-hidden');
            });
        }
    })
    .on('click', '.card', function(e){
        e.preventDefault();
        if (isTablet) {
            $.get('task.html', function(response){
                app.popup('<div class="popup" data-page="task">' + response + '</div>');
            });
        } else {
            view.router.loadPage('task.html');
        }
    })
    .on('click', '.checklist-item', function(){
        $(this).toggleClass('checked')
    })

app.onPageAfterAnimation('*', function(page){
    var $page = $(page.container);
    if ($page.hasClass('with-toggle-save')) {
        $page.once('input', '.toggle-save', function(){
            $(page.navbarInnerContainer).find('.save').addClass('active')
        });
    }
});


app.onPageInit('index', function(page){
    var $page = $(page.container);
    swiper = app.swiper('.swiper-container', {
        centeredSlides: !isTablet,
        spaceBetween: 0,
        freeMode: false,
        freeModeSticky: true,
        slidesPerView: 'auto'
    });
    $page.find('.list-content').each(function(){
        var $el = $(this);
        console.log($el[0], $el[0].scrollHeight, $el[0].clientHeight)
        if ($el[0].scrollHeight >= $el[0].clientHeight)
            $el.parent().addClass('hasScroll');
    });
    $page.on('click', '.fast-add-toggle', function(){
        var $el = $(this),
            $panel = $el.closest('.in').removeClass('in').siblings().addClass('in');
        if ($el.data('input-focus'))
            $panel.find('input').focus();
    });
});

app.onPageInit('task', function(page){
    var $navbar = $(page.navbarInnerContainer), className = 'with-title';

    $(page.container).find('.page-content').scroll(function(e){
       if (e.target.scrollTop > 100)
           $navbar.addClass(className);
       else
           $navbar.removeClass(className);
    });
});

app.init();