$(document).ready(function(){
		$('.scroller').scrollify(); 

		$('#incresefont').click(function(){	   
			
        curSize= parseInt($('body').css('font-size')) + 1; 
		if(curSize<=18)
        $('body').css('font-size', curSize);
        });  

		$('#decresefont').click(function(){	   
        curSize= parseInt($('body').css('font-size')) - 1;
		if(curSize>=10)
        $('body').css('font-size', curSize);
        }); 

		$("#normalfont").click(function(){
			curSize= 14;
			$("body").css("font-size",curSize);
		});

		$('select').attr("aria-describedby","Select_alert");

		$('#Defaultcontrast').click(function(){	   
			$("body").removeClass("highContrast");
        });  

		$('#Highcontrast').click(function(){	   
			$("body").addClass("highContrast");
        });  

var btn1 = $('#topbutton');

$(window).scroll(function() {
  if ($(window).scrollTop() > 300) {
	
    btn1.addClass('show');
  } else {
    btn1.removeClass('show');
  }
});

btn1.on('click', function(e) {
  e.preventDefault();
  $('html, body').animate({scrollTop:0}, '300');
});

		
});
