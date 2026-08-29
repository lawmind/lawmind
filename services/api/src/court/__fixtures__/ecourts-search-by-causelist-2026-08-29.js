//$('#causelist_date').datepicker();
$(document).ready(function () {
	document.title =' Cause list  - eCourt India Services';
$('.sidebarMainMenu .nav-link').removeAttr('aria-current');
	$("#leftPaneMenuCL").attr("aria-current", "page");
  $('#cause_list_captcha_code').on('input', function () {
    $(this).val($(this).val().replace(/[^a-zA-Z0-9 ]/g, ''));
  });
	$('#causelist_date').on('input', function () {
    $(this).val($(this).val().replace(/[^ ]/g, ''));
  });
});

//datePickerIcon('causelist_date',0); 
datePickerIcon('causelist_date','+1m','-7'); 
$("#s_type").val('cause');

function submit_causelist(cicri)
{ 
	
	var flag=cicri;

	if(validate_state_dist_complex()) //======== written in common function.js
	{
		var retValNxtMon=checkDateInpuWithNextMonth($("#causelist_date").val());
         	if(retValNxtMon==false) //30092016
        	{
         		 alert("Selection only upto 1 month allowed.");
          		return false;
        	}	

		if(validateCauseList())
		{
			var state_code    = $("#sess_state_code").val() ;
			var dist_code     = $('#sess_dist_code').val();
			var courtArr      = $('#court_complex_code').val();
			var court_est_arr = courtArr.split('@');
			var court_complex = court_est_arr[0];
			var est_code      = $('#court_est_code').val();
			var causelist_date= $('#causelist_date').val();
			var today = new Date();
			var toddd = today.getDate();
			var todmm = today.getMonth()+1; //January is 0!
			var todyyyy = today.getFullYear();

			if(toddd<10)
			{
				toddd='0'+toddd
			} 
			if(todmm<10)
			{
				todmm='0'+todmm
			} 
			var curYMD = todyyyy+'-'+todmm+'-'+toddd;
			var curDMY = toddd+'-'+todmm+'-'+todyyyy;
			var causelist_date_split=causelist_date.split('-');

			var causelist_date_y=causelist_date_split[2];

			var causelist_date_m=parseInt(causelist_date_split[1])-1;
			if(causelist_date_m<10)
			{
				causelist_date_m='0'+causelist_date_m;
			} 

			var causelist_date_d=causelist_date_split[0];
			if(causelist_date_d<10)
			{
				causelist_date_d='0'+causelist_date_d;
			} 

			var seldate= new Date(causelist_date_y,causelist_date_m,causelist_date_d); 

			var one_day=1000*60*60*24;

		  // Convert both dates to milliseconds
			 var today_ms = today.getTime();
			 var seldate_ms = seldate.getTime();
			
			 var daysdiff=Math.ceil(((today_ms-seldate_ms)/(one_day))-1);

			if(daysdiff>=1)
			{
				var selprevdays=1;
			}
			else
			{
				var selprevdays=0;
			}	

			var fcaptcha_code=$('#fcaptcha_code').val();
			if(fcaptcha_code=='')
			{
				errorAlert(alerts_array[475]);
				return false;
			}
		   var url="cause_list/submitCauseList";
		   var court_name_txt=$("#CL_court_no option:selected").text();
		 
		   var postdata =$("#frm_causelist").serialize()+"&court_name_txt="+court_name_txt+"&state_code="+state_code+"&dist_code="+dist_code+"&court_complex_code="+court_complex+"&est_code="+est_code+"&cicri="+flag+"&selprevdays="+selprevdays;

		   $("#help_clist").hide();

			ajaxCall({url:url,postdata:postdata,callback:callbackParty,connection:'N'});
				function callbackParty(obj){  
					$('#div_captcha_cause_list').html(obj.div_captcha);	
					if(obj.status==0)
                {                
				$("#cause_list_captcha_code").val('');
                captcha_image_audioObj.refresh();                
				document.getElementById('captcha_image').src = 'vendor/securimage/securimage_show.php? ' + Math.random(); 
				this.blur();
                return false;                }
                else if(obj.status ==1)
					{ 	
						$('#res_cause_list').html(obj.case_data);
						$('#cause_list_captcha_code').val('');
					} else {
						$('#res_cause_list').html('');
				}
				
			}
		 }
	}
	
}

function validateCauseList()
{
	
	$("#frm_causelist").validate();
    pattern();
   
    $('#CL_court_no').rules('add', {
    	required:true,
		//alphabet : true,
        messages: {
        required: alerts_array[46],
        //maxlength: 'Jo Code is required maximum 254 characters',
        }
    });

	 $('#causelist_date').rules('add', {
    	required:true,
		date : true,
		maxlength : 10,
        messages: {
        required: alerts_array[723],		
        date: 'Invalid Date',
		maxlength : 'Cause List date is required maximum 10 digit'
        }
    });
        
    if(!$('#frm_causelist').valid())
        $('.error').first().focus();
    return $('#frm_causelist').valid();


}
