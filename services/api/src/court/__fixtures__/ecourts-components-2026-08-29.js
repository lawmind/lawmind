console.clear();

$(document).ready(function() {

if (!$.isArray) {
  $.isArray = Array.isArray;
}

if (!$.trim) {
  $.trim = function (str) {
    return (str || "").trim();
  };
}

	//location.reload(true);
	$('#main_back_CaveatSearch').hide();			
	$('#main_back_CauseList').hide();		
	$('#main_back_cnr').hide();
	
	
  $.ajaxSetup({ cache: true });
  //$('select').chosen();
  $.validator.setDefaults({ ignore: ":hidden:not(select)" });
	
/*  $("#change-profile-pic").click( function(e){
		//alert('anil');
		e.preventDefault();
		$("#changePic").modal('show');
	});

	$("#change-password").on('click', function(e){
		e.preventDefault();
		$("#changePassword").modal('show');
		$('#old_pass').val('');
		$('#new_pass').val('');
		$('#conf_pass').val('');
	});

	$('#photoimg').change(function()	
	{ 
		$("#preview-avatar-profile").html('');
		$("#preview-avatar-profile").html('Uploading....');
		var postdata=new FormData($('#cropimage')[0]);
	
	 	var url="profile/changeAvatar";
		ajaxCallNew(url,postdata,callback,'cropimage');
		function callback(result)
		{
			$('#preview-avatar-profile').html(result.image);
			$('img#photo').imgAreaSelect({
				aspectRatio: '1:1',
				onSelectEnd: getSizes
				});
		}
		/*$("#cropimage").ajaxForm(
		{
		target: '#preview-avatar-profile',
		success:    function() { 
				$('img#photo').imgAreaSelect({
				aspectRatio: '1:1',
				onSelectEnd: getSizes,
			});
			}
		}).submit();

	});*/
	
	noBack();
	//window.history.back();
	/*document.onmousedown=disableclick;
	status="Right Click is not allowed";
	
    $(document).on("keydown", disableF5);
	*/
	/*var sidebar=localStorage.getItem("sidebar");
	//alert(sidebar+'=='+$( "#accordionSidebar" ).hasClass( "toggled" ))
	if(sidebar=='Y')
		$('#accordionSidebar').addClass('toggled');
	else
		$('#accordionSidebar').removeClass('toggled');*/

	$(document).on('click',function(){
		$('.collapse').removeClass('show');
	});
	
	setToken();
	
});

function showmodalReport(url)
{
	$('#modal_ifr').modal('show');
	str="<iframe src='"+url+"' style='width:100%; height:90vh;'></iframe>";
	$('#db_title').attr('style','color:#fda006;');
	//alert(result)
	// $('#db_body').load($(this).attr('href'));
	$('#modal_ifr_body').html(str);
}

function externalLink(url)
{
	$('#externalSiteModal').modal('show');
	$('#externalSiteLink').attr('href',url);
	
}

function setToken()
{
	var app_token=$('#app_token').val();
	//alert('anilPPP'+app_token);
	$('a').on('click',function() {
		//alert('anil'+$(this).attr('href'));
		var href=$(this).attr('href');
		if(app_token!=undefined && href!=undefined)
		{
			if(!$(this).hasClass('noToken'))
				$(this).attr('href','#');
			//alert(href)
			var ques=href.includes('?');
			var token_exists=href.includes('app_token');
			if(!token_exists)
			{
				
				if(!$(this).hasClass('noToken'))
				{
					if(ques)
						href1=href+"&app_token="+app_token;
					else
						href1=href+"?app_token="+app_token;
				}
				
			}
			else
			{
				if(!$(this).hasClass('noToken'))
				{
					a=href.split('app_token');
					href1=a[0]+'app_token='+app_token;
				}
			}
			if(!$(this).hasClass('noToken'))
				$(this).attr('href',href1);
			//alert('role'+$(this).attr('href'));
		}

	});
	$('button').on('click',function() {
		$('a').each(function() {
			//alert('anil'+$(this).attr('href'));
			var href=$(this).attr('href');
			if(app_token!=undefined && href!=undefined)
			{
				if(!$(this).hasClass('noToken'))
					$(this).attr('href','#');
				//alert(href)
				var ques=href.includes('?');
				var token_exists=href.includes('app_token');
				if(!token_exists)
				{
					if(!$(this).hasClass('noToken'))
					{
						if(ques)
							href1=href+"&app_token="+app_token;
						else
							href1=href+"?app_token="+app_token;
					}
					
				}
				else
				{
					if(!$(this).hasClass('noToken'))
					{
						a=href.split('app_token');
						href1=a[0]+'app_token='+app_token;
					}
				}
				if(!$(this).hasClass('noToken'))
					$(this).attr('href',href1);
				//alert('role'+$(this).attr('href'));
			}
		});
	});
}
function requestUri(param)
{
	var app_token=$('#app_token').val();
	var base_url=$('#base_url').val();
	var redirect_path=base_url+"/?p="+param+"&app_token="+app_token;
	//alert(redirect_path)
	window.location.replace(redirect_path);
}
function noBack() { window.history.forward(); }

function disableclick(e)
{
	if(event.button==2)
	{
		alert(status);
		return false;
	}
}
function checkStatus(cnr,filename,case_val)
{
	
	var url='cnr_status/checkStatus';
	var postdata='case_no='+cnr+'&filename='+filename+'&case_val='+case_val;
	//alert(postdata);
	ajaxCall({url:url,postdata:postdata,callback:callbk});
	function callbk(result)
	{
		
	}
	
}

function displayPdf(normal_v,case_num,court_code,ofilename,appFlag)
{
	
	var url='home/display_pdf';
	var postdata="&normal_v="+normal_v+"&case_val="+case_num+"&court_code="+court_code+"&filename="+ofilename+"&appFlag="+appFlag;
	//alert(postdata);
	ajaxCall({url:url,postdata:postdata,callback:callbk});
	function callbk(result)
	{
		//alert(window.matchMedia("(max-width: 767px)").matches);
		 if(result.status)
		{
			if(window.matchMedia("(max-width: 767px)").matches)
			{
								//window.location.replace("https://services.ecourts.gov.in/ecourtindia_v6/"+result.order);
						window.open("https://services.ecourts.gov.in/ecourtindia_v6/" + result.order, '_blank');

			}
			else
			{
					$("#p_order").val(result.order);
						file_name="<object data='"+result.order+"' height='100%' width='100%' style='min-height:600px;'></object>";
						$("#modal_order_body").show().html(file_name);
				var myModal = new bootstrap.Modal($('#modalOders'), {
						backdrop: "static", //remove ability to close modal with click
						keyboard: false, //remove option to close with keyboard
						show: true //Display loader!
				});
				}
				myModal.toggle();
		}

	}
	
}

function display_case_acknowlegement(url)
{
	//alert(url);
	//var url='cnr_status/checkStatus';
	var postdata='';
	//alert(postdata);
	ajaxCall({url:url,postdata:postdata,callback:callbk});
	function callbk(result)
	{
		if(result.status)
		{
			$("#modal_ack_body").show().html(result.ack_details);
			var myModal = new bootstrap.Modal($('#modal-ack'), {
				backdrop: "static", //remove ability to close modal with click
				keyboard: false, //remove option to close with keyboard
				show: true //Display loader!
			});
			myModal.toggle();
		}
	}
	
}

function closefile()
{

}

function funView_CinoHistory(cino)
{
		var cinolen=cino.length;

     	if(cinolen !=16 )
		{
			errorAlert(alerts_array[262]);
			return false;
		}
		var cino = cino.toUpperCase();

		if(cino!="")
		{
		if (!cino.match(/^[a-zA-Z0-9]+$/) && cino!="")
		{
		errorAlert(alerts_array[263]);
		return false;

		}
		}
		var url="cnr_status/viewCNRHistory/";
		var postdata = "cino="+cino ;
		ajaxCall({url:url,postdata:postdata,callback:callbackEST});
		/*$('#cnr_div').hide();
		$('#help_cnr').hide();
		$('#main_back_cnr').show();*/
		function callbackEST(result)
		{
			$('#modal_est_trans_body').html('');
			$(this).attr('href', 'javascript:void(0);');
			//$('#div_captcha_cnr').html(result.div_captcha);
			if(result.status)
			{
				$('#modal_trans_est').show();
				$('#modal_est_trans_body').html(result.casetype_list);

			}
		}

}

function disableF5(e) { 
	if ((e.which || e.keyCode) == 116 || (e.which || e.keyCode) == 82) e.preventDefault(); 
};

function ajaxCall(jsonobj)
{
	var delimeter="764r6hry7ffds";
	$(".alert-danger").hide();$("#msg-danger").html('');
	$(".alert-success").hide();$("#msg-success").html('');
	var base_url=$('#base_url').val();
	var token=$('#app_token').val();
	var url=jsonobj.url;
	var postdata=jsonobj.postdata;
	var callback=jsonobj.callback;
	var connection=jsonobj.connection;
	var redirect=jsonobj.redirect;
	var flag=jsonobj.flag;

	var result= [];
	if(jsonobj.chosen==false)
		objchosen={chosen:false};
	else if(jsonobj.chosen==true)
		objchosen={chosen:true};
	else if(typeof jsonobj['chosen'] == 'undefined')
		objchosen={chosen:false};
	if(typeof jsonobj['dataType'] == 'undefined')
		jsondataType='json';
	else
		jsondataType=jsonobj.dataType;

	if(typeof jsonobj['loader'] == 'undefined')
		objloader={loader:true};
	else
		objloader=jsonobj.loader;
	if(objloader && flag!='header')
		fadein();

	setTimeout(function(){
	var chosen=objchosen.chosen;

	var estCode = $("#selEstablishment").val();
	if(estCode!='' && estCode!=undefined)
	{
		var myarr = estCode.split("~");
		var stateCode = myarr[0];
		var distCode = myarr[1];
		var estCode = myarr[2];
	}
	
	/*if($('#hid_case_adv_pde').val() && $('#hid_case_adv_flag').val()){
		postdata +="&hid_case_adv_pde="+$('#hid_case_adv_pde').val()+"&hid_case_adv_flag="+$('#hid_case_adv_flag').val()
	}*/

	
	
	$.ajax({
		type: "POST",
		url:  base_url+'/?p='+url,
		dataType: jsondataType,
		async: false,
		data:postdata+'&ajax_req='+true+'&app_token='+token,
		headers: {
        "delimeter": delimeter,
			"G73hdfdsh":delimeter
		},
		error: function(jqXHR, textStatus, errorThrown) {
		if(flag!='header'){
			fadeout();
		}
			//setTimeout(function(){fadeout()},300);
		//	setTimeout(function(){fadeout()},1000);
			var responseArray=jqXHR.responseText.split('#####');
				
			if(redirect=='Y')
			{
				$('#redirect').html(jqXHR.responseText);
			}
		
			$('#submitdata').attr('disabled',false);
			
			
			if(responseArray[1]!='' && responseArray[1]!=undefined)
			{
				$('#app_token').val(responseArray[1]);
				setToken();
			}
			else
			{
				
				responseArray=jqXHR.responseText.split('"app_token":"');
				if(responseArray[1]!=undefined)
				{
					abc=responseArray[1].split('"}');
					if(abc!=undefined)
					{
						$('#app_token').val(abc[0]);
						setToken();
					}
					
				}
				/*else
				{
					$.ajax({
					type: "POST",
					url:  base_url+'/?p=defaultCls/amrt',
					dataType: jsondataType,
					async: false,
					data:postdata+'&ajax_req='+true+'&app_token='+token,		
					error: function(jqXHR, textStatus, errorThrown) {
					},
					success:function( result ) {
						$('#app_token').val(result.amrt);
						setToken();
					}
					});
				}*/
			}
			if(responseArray[0]!='' && responseArray[0]!=undefined && responseArray[0]!=null && redirect!='Y')
				errorAlert(responseArray[0]);
		
		
			result['status']=false;
			callback(result);
		},
		beforeSend:function()
	   	{	
	   			
	   	},
		success:function( result ) {
			$('#app_token').val(result.app_token);
			setToken();
			//if(url != restricted_url && url != restricted_url1){
					if(flag!='header'){
						setTimeout(function(){fadeout()},300);
						setTimeout(function(){fadeout()},1000);
					}
			//}
			if(result.errormsg!='' && result.errormsg!=undefined && result.errormsg!=null)
			{
				
				errorAlert(result.errormsg);
				result['status']=false;
				callback(result);
				return false;
			}
			if(result.msg!='' && result.msg!=undefined && result.msg!=null)
			{
			
				successAlert(result.msg);
			}
			
				if(flag!='header'){
					setTimeout(function(){fadeout()},1500);
				}
			result['status']=true;
			callback(result);
			
		}
	
	})},50);
}

function ajaxCallNormal(jsonobj)
{
	
	$(".alert-danger").hide();$("#msg-danger").html('');
	$(".alert-success").hide();$("#msg-success").html('');
	var base_url=$('#base_url').val();
	var token=$('#app_token').val();
	var url=jsonobj.url;
	var postdata=jsonobj.postdata;
	var callback=jsonobj.callback;
	var connection=jsonobj.connection;
	var result= [];
	if(jsonobj.chosen==false)
		objchosen={chosen:false};
	else if(jsonobj.chosen==true)
		objchosen={chosen:true};
	else if(typeof jsonobj['chosen'] == 'undefined')
		objchosen={chosen:false};
	if(typeof jsonobj['dataType'] == 'undefined')
		jsondataType='json';
	else
		jsondataType=jsonobj.dataType;

	if(typeof jsonobj['loader'] == 'undefined')
		objloader={loader:true};
	else
		objloader=jsonobj.loader;
	if(objloader)
//		fadein();

	var chosen=objchosen.chosen;
	var estCode = $("#selEstablishment").val();

	if(estCode!='' && estCode!=undefined)
	{
		var myarr = estCode.split("~");
		var stateCode = myarr[0];
		var distCode = myarr[1];
		var estCode = myarr[2];
	}
	
	if($('#hid_case_adv_pde').val() && $('#hid_case_adv_flag').val()){
		postdata +="&hid_case_adv_pde="+$('#hid_case_adv_pde').val()+"&hid_case_adv_flag="+$('#hid_case_adv_flag').val()
	}
	
	var restricted_url = 'advocate_case_registration/getActs';
	var restricted_url1 = 'advocate_case_registration/autocomplete_section';
	$.ajax({
		type: "POST",
		url:  base_url+'/?p='+url,
		async: false,
		data:postdata+'&ajax_req='+true+'&app_token='+token,		
		error: function(jqXHR, textStatus, errorThrown) {
			
			var responseArray=jqXHR.responseText.split('#####');
			if(responseArray[0]!='' && responseArray[0]!=undefined && responseArray[0]!=null)
				errorAlert(responseArray[0]);
			setTimeout(function(){fadeout()},300);
			setTimeout(function(){fadeout()},1000);
			$('#submitdata').attr('disabled',false);
			
		
			if(responseArray[1]!='' && responseArray[1]!=undefined)
			{
				$('#app_token').val(responseArray[1]);
				setToken();
			}
			
		
			result['status']=false;
			callback(result);
		},
		beforeSend:function()
	   	{	//alert('fadein')
				//if(chosen && url != restricted_url && url != restricted_url1)
	   			
	   	},
		success:function( result ) {
			
			$('#app_token').val(result.app_token);
			setToken();
			//if(url != restricted_url && url != restricted_url1){
			setTimeout(function(){fadeout()},300);
			setTimeout(function(){fadeout()},1000);
			//}
			if(result.errormsg!='' && result.errormsg!=undefined && result.errormsg!=null)
			{
				//$(".alert-danger").show();$("#msg-danger").html(result.errormsg);
				errorAlert(result.errormsg);
				result['status']=false;
				callback(result);
			}
			if(result.msg!='' && result.msg!=undefined && result.msg!=null)
			{
				
				successAlert(result.msg);
			}
			
			callback(result);
						
		}
	
	});
}



function ajaxExternalCall(url,postdata,callback)
{
	$(".alert-danger").hide().html('');
	$(".alert-success").hide().html('');
	
	$.ajax({
		type: "POST",
		url:  url,
		dataType: 'json',
		async: false,
		data:postdata,		
		error: function(jqXHR, textStatus, errorThrown) {
		
			fadeout();
		},
		beforeSend:function()
	   	{		
	   		fadein();
	   	},
		success:function( result ) {
			
			fadeout();
			
			callback(result);
			
		}
	
	});
}

function jsonCall(url,postdata,callback)
{
	$(".alert-danger").hide().html('');
	$(".alert-success").hide().html('');
    var base_url=$('#base_url').val();
    var token=$('#app_token').val();

	var url1=base_url+"/?p="+url+'&app_token='+token;
	//var url="jsonFiles/jsondistrict.php";
	fadein();
	$.getJSON(url1,postdata ,function(obj)
   	{
		fadeout();
		if(obj.errormsg!='' && obj.errormsg!=undefined && obj.errormsg!=null)
			$(".alert-danger").show().html(obj.errormsg);
		if(obj.msg!='' && obj.msg!=undefined && obj.msg!=null)
			$(".alert-success").show().html(obj.msg);
		$('#app_token').val(obj.app_token)
		setToken();
		callback(obj);

    }).fail(function(jqXHR, textStatus, errorThrown) {
     
       var responseArray=jqXHR.responseText.split('#####');
		$(".alert-danger").show().html(jqXHR.responseText);
		//$('#submitdata').attr('disabled',false);
		fadeout();
		if(responseArray[1]!='' && responseArray[1]!=undefined)
		{
			$('#app_token').val(responseArray[1]);
			setToken();
		}
		
    });


}

function ajaxCallNew(url,postdata,callback,formid)
{
	$(".alert-danger").hide().html('');
	$(".alert-success").hide().html('');
	var base_url=$('#base_url').val();
	var token=$('#app_token').val();
	postdata.append('ajax_req', true);
	var result= [];
	fadein();
	$.ajax({
		type: "POST",
		url:  base_url+'/?p='+url,
		dataType: 'json',
		async: "false",
		cache: false,
        contentType: false,
        processData: false,
		data:postdata,		
		error: function(jqXHR, textStatus, errorThrown) {
			
			var responseArray=jqXHR.responseText.split('#####');
			
			
			if(responseArray[0]!='' && responseArray[0]!=undefined && responseArray[0]!=null)
				errorAlert(responseArray[0]);
			setTimeout(function(){fadeout()},300);
			setTimeout(function(){fadeout()},1000);
			$('#submitdata').attr('disabled',false);
			
			
			if(responseArray[1]!='' && responseArray[1]!=undefined)
			{
				$('#app_token').val(responseArray[1]);
				setToken();
			}

			result['status']=false;
			callback(result);
		},
		beforeSend:function()
	   	{	//alert('fadein')
				//if(chosen && url != restricted_url && url != restricted_url1)
	   			
	   	},
		success:function( result ) {
			
			$('#app_token').val(result.app_token);
			setToken();
			//if(url != restricted_url && url != restricted_url1){
		//	setTimeout(function(){fadeout()},300);
		//	setTimeout(function(){fadeout()},1000);
			//}
			if(result.errormsg!='' && result.errormsg!=undefined && result.errormsg!=null)
			{
				//$(".alert-danger").show();$("#msg-danger").html(result.errormsg);
				errorAlert(result.errormsg);
				result['status']=false;
				callback(result);
			}
			if(result.msg!='' && result.msg!=undefined && result.msg!=null)
			{
				
				successAlert(result.msg);
			}
			result['status']=true;
			callback(result);
			
			
			
		}
	});
}
function fadein()
{
	//$("form").css("background",'#989898').css("opacity",'0.7');			
	//$(".faded").show();
	var myModal = new bootstrap.Modal($('#loadMe'), {
   backdrop: "static", //remove ability to close modal with click
      keyboard: false, //remove option to close with keyboard
      show: true //Display loader!
})
	myModal.toggle();
	
	
}
function fadeout()
{
	//$("form").show().css("background",'white').css("opacity",'1');
	//$(".faded").hide();
	
	$("#loadMe").modal("hide");
	$("#loadMe").removeClass("show");
	$("#loadMe").removeClass("fade");
	$("#loadMe").addClass("hide");
	$("body").removeAttr("style");
	$('.modal-backdrop').remove();	
	//alert('bbb')

}

function closeModel(obj)
{
	var modal_id=obj.modal_id;
	var clear_data=obj.clear_data_id;
	if(clear_data!='' && clear_data!=undefined)
		$("#"+clear_data).html('');
	
	$("#"+modal_id).modal("hide");
	$("#"+modal_id).removeClass("show");
	$("#"+modal_id).removeClass("fade");
	$("#"+modal_id).addClass("hide");
	$(".xdsoft_datetimepicker").hide();
	$('.popover').popover('hide');
	$('.modal-backdrop').remove();
	
}

function get_age(dob) {
    var diff_ms = Date.now() - dob.getTime();
    var age_dt = new Date(diff_ms);

    return Math.abs(age_dt.getUTCFullYear() - 1970);
}

function datePickerIcon(mydate,maxDate1,minDate1)
{
	var base_url=$('#base_url').val();
	if(minDate1=='' || minDate1==undefined)
		minDate1=new Date('15-08-1947'); 	//minDate1='15-08-1947';

   $('#'+mydate).datepicker({
		
	// defaultDate: new Date(2014, February 2015'), 
	  onClose: function(date, datepicker) {
		  if (datepicker.id == "fpet_dob") {
				if (date != "") {
					var bdate = date.split("-");
					var bday = bdate[0];
					var bmonth = bdate[1];
					var byear = bdate[2];
					var my_age = get_age(new Date(byear, bmonth, bday));
					$('#fextra_age').val(my_age);
				}
		  }

		  if (datepicker.id == "fpet_dob_lh") {
				if (date != "") {
					var bdate = date.split("-");
					var bday = bdate[0];
					var bmonth = bdate[1];
					var byear = bdate[2];
					var my_age = get_age(new Date(byear, bmonth, bday));
					$('#fextra_age_lh').val(my_age);
				}
		  }
                },
	  dateFormat: 'dd-mm-yy',
	  changeMonth: true,
	  changeYear: true,
	  // beforeShowDay: editDays,
	  showOtherMonths: true,
	  selectOtherMonths: true,
	  showOn: "button",
	  buttonImage: base_url+"/jquery-date/images/calendar.gif",
	   buttonImageOnly: true,
	   maxDate: maxDate1,
	  minDate: minDate1,
	  yearRange: "-100:+2",
	}).next('img.ui-datepicker-trigger').attr('tabIndex', "-1");;
}



function compulsaryCheck(str,flag)
{	
	if(flag=='Y')
	{
	
	$('#'+str).rules("add", {
				required: true,  			
				messages    : {
				required    : alerts_array[1],
				}
			});
			setTimeout(function() {$('#'+str).css('background','rgb(229, 247, 254)')}, 300);	
	}
	else if(flag=='N')
	{
	
	
			$('#'+str).rules("add", {
				required: false
			});
			setTimeout(function() {$('#'+str).css('background','white')}, 300);	
			
	}
		
}
function manualCheck(str,msg)
{

	 if(msg=='N')
	{
	
	
			$('#'+str).rules("add", {
				manual_invalid: false,  			
			
			});
			
	}
	else
	{ 
		$('#'+str).rules("add", {
				manual_invalid: true,  			
				messages    : {
				manual_invalid  : msg,
				}
			});
	}
	
		
}

function customizeValidation(str,msg,reg_expr)
{
	
	$('[name="'+str+'"]').rules("add", {
			
			
			cutomize   : true,  
			
			messages    : {	
			
			cutomize    : msg,
		  
			}
	});
		
	
	$.validator.addMethod("cutomize", function( value, element ) {
		var regex = new RegExp(reg_expr);
		var key = value;
		
		if (regex.test(key)) {
		   return true;
		}
		return false;
    });
}
function logOut()
{
	var base_url=$('#base_url').val();
	var a=confirm('Are you sure you want to logout?')
    if(a)
	{
		var app_token=$('#app_token').val();
		window.location.href=''+base_url+'/?p=login/logOut&app_token='+app_token;
	}
}

function sideBarToggle()
{
	$('#accordionSidebar').toggleClass('toggled');
	if($( "#accordionSidebar" ).hasClass( "toggled" ))
		localStorage.setItem("sidebar", "Y");
	else
		localStorage.setItem("sidebar", "N");
	$('#appl_logo').toggleClass('appl_logo');
	
}


$.validator.addMethod("accept", function(value, element, param) {
  return value.match(new RegExp("." + param + "$"));
});
$.validator.addMethod("alphanum", function(value, element) {
  return this.optional(element)|| /^\w+$/i.test(value);
});


$.validator.addMethod("EngNotAllowed", function( value, element ) {
        var regex = new RegExp("^[^a-zA-Z]*$");
        var key = value;
		
        if (regex.test(key)) {
           return true;
        }
        return false;
    });

$.validator.addMethod('time', function(value, element, param) {
    return value == '' || value.match(/^([01][0-9]|2[0-3]):[0-5][0-9]$/) || value.match(/^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/);
}, 'Enter a valid time: hh:mm');

$.validator.addMethod("EngAndSpecialCharNotAllowed", function( value, element ) {
        var regex = new RegExp("^[^a-zA-Z<>\";`%!~#$|+%&*=\[\\]\:^{}?]*$");
        var key = value;
		
        if (regex.test(key)) {
           return true;
        }
        return false;
    });
	$.validator.addMethod("OnlySpecialCharsNotAllowed", function( value, element ) {
        
		// var regex = new RegExp("^[0-9@,-./_]*$");
		var regex = new RegExp("^[^0-9][()@,./\-_:]*$");
        var key = value;
		
        if (regex.test(key)) {
           return false;
        }
		else
		{
        return true;
		}
    });
	$.validator.addMethod("CharCheckForSection", function( value, element ) {
        
		 var regexalpha = new RegExp("^[a-zA-Z0-9,()]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) || keyalpha=='') {
           return true;
        }
        return false;
    });


$.validator.addMethod("specialChars", function( value, element ) {
        var regex = new RegExp("^[^<>\";`%!~#$|+%&*=\[\\]\:^{}?]*$");
        var key = value;
		
        if (regex.test(key)) {
           return true;
        }
        return false;
    });


	


	$.validator.addMethod("nospecialChars", function( value, element ) {
        //var regex = new RegExp("^[^<>'\"/;`%!~#$%&*()=\[\\]\:{}?@.,_-]*$");
        var regex = new RegExp("^[a-zA-Z]+$");
        var key = value;

        if (regex.test(key)) {
           return true;
        }
        return false;
    });
	$.validator.addMethod("urlspecialChars", function( value, element ) {
        var regex = new RegExp("^[^<>'\";`%!~#$%&*()=\[\\]\^{}?@,]*$");
        var key = value;
		
        if (regex.test(key)) {
           return true;
        }
        return false;
    });

	/*$.validator.addMethod("alphabet", function( value, element ) {
        var regexalpha = new RegExp("^[a-zA-Z0-9()@,. -_/\\n]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) || keyalpha=='') {
           return true;
        }
        return false;
    });*/

	$.validator.addMethod("emailchar", function( value, element ) {
        var regexalpha = new RegExp("^[a-zA-Z0-9@._-]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) || keyalpha=='') {
           return true;
        }
        return false;
    });

	$.validator.addMethod("alphabetnumber", function( value, element ) {
        var regexalpha = new RegExp("^[a-zA-Z0-9,]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) || keyalpha=='') {
           return true;
        }
        return false;
    });

	$.validator.addMethod("noalphabet", function( value, element ) {
        var regexalpha = new RegExp("^[a-zA-Z]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) && keyalpha!='') {
           return false;
        }
        return true;
    });
	$.validator.addMethod("manual_valid", function( value, element ) {       
						 return true;
						});
$.validator.addMethod("manual_invalid", function( value, element ) {       
						 return false;
						});

							


function hasWhiteSpace(s) {

  return /\s/g.test(s);
}

$.validator.addMethod("notNumber", function(value, element, param) {
	   var reg = /[0-9]/;
	   var regex = new RegExp("^[0-9()@,-./_]*$");
	   var regex1 = new RegExp("^[()@,-./_0-9()@,-./_ ']+( [()@,-./_0-9()@,-./_ ']+)*$");
		//var regex2 = new RegExp("^[0-9@,./_]+( [0-9']+)*$");

			
		
	  /* if((!isNaN(value) || value.indexOf(' ') >= 0 || regex.test(value)) && value!="" ){
			 return false;
	   }else{
			   return true;
	   }
	 */
	 //if((!isNaN(value) || regex.test(value) || regex1.test(value) || value.indexOf('\\') >= 0) && value!="" )--for not allowing \
		if((!isNaN(value) || regex.test(value) || regex1.test(value) ) && value!="" ){
			 return false;
	   }else{
			   return true;
	   }	

	  

});



 $.validator.addMethod("Number", function(value, element, param) {
                       var reg =  /^[0-9]+$/;					
                       if (reg.test(value)) {
								return true;
						}
						else
						{
							 return false;
						}

                });

	$.validator.addMethod("onlyzeronotallowed", function(value, element, param) {                     	
		if( value!='')
				{
	
                       if (parseInt(value)>0) {
								return true;
						}
						else
						{
							 return false;
						}
				}
				else
				{
					 return true;
				}

                });






$.validator.addMethod("noNumberAtAll", function(value, element, param) {
                       var reg = /[0-9]/;					
                       if (reg.test(value)) {
								return false;
						}
						else
						{
							 return true;
						}

                });




$.validator.addMethod("validstring", function(value, element, param) {
                       var reg = /(.)\1{2,}/;					
                       if (reg.test(value)) {
								return false;
						}
						else
						{
							 return true;
						}

                });







$.validator.addMethod("date", function(date, element) {
 //              
   /*var regDate = /^(((0[1-9]|[12]\d|3[01])\-(0[13578]|1[02])\-((19|[2-9]\d)\d{2}))|((0[1-9]|[12]\d|30)\-(0[13456789]|1[012])\-((19|[2-9]\d)\d{2}))|((0[1-9]|1\d|2[0-8])\-02\-((19|[2-9]\d)\d{2}))|(29\-02\-((1[6-9]|[2-9]\d)(0[48]|[2468][048]|[13579][26])|((16|[2468][048]|[3579][26])00))))$/;
   if (optional(element) || date.match(regDate))
	{
		return true;
	}
	return false;*/
  return this.optional(element) || date.match(/^(((0[1-9]|[12]\d|3[01])\-(0[13578]|1[02])\-((19|[2-9]\d)\d{2}))|((0[1-9]|[12]\d|30)\-(0[13456789]|1[012])\-((19|[2-9]\d)\d{2}))|((0[1-9]|1\d|2[0-8])\-02\-((19|[2-9]\d)\d{2}))|(29\-02\-((1[6-9]|[2-9]\d)(0[48]|[2468][048]|[13579][26])|((16|[2468][048]|[3579][26])00))))$/);
  });




$.validator.addMethod("float1", function(value, element) {

                       var reg = /^[-+]?\d{0,12}(\.\d{1})?\d{0,2}$/;
                       if (reg.test(value)) {
								return true;
						}
						else
						{
							 return false;
						}

                });

function errorAlert(msg)
{  //alert("err="+msg);
	$('#successIcon').addClass('d-none');
	$('#errorIcon').removeClass('d-none');
	$(".alert-danger-cust").show().html(msg);
	$(".alert-success-cust").hide().html('');
//	$('#validateError').modal('show'); 

var myModal = new bootstrap.Modal($('#validateError'), {
   backdrop: "static", //remove ability to close modal with click
      keyboard: false, //remove option to close with keyboard
      show: true //Display loader!
})
	myModal.toggle();

	/*$("#validateError").modal({
	 backdrop: "static", //remove ability to close modal with click
	 keyboard: false, //remove option to close with keyboard
	  show: true //Display loader!
	});*/
}
function successAlert(msg)
{
	$('#errorIcon').addClass('d-none');
	$('#successIcon').removeClass('d-none');
	$(".alert-success-cust").show().html(msg);
	$(".alert-danger-cust").hide().html('');

	var myModal = new bootstrap.Modal($('#validateError'), {
		backdrop: "static", //remove ability to close modal with click
		keyboard: false, //remove option to close with keyboard
		show: true //Display loader!
	});
	myModal.toggle();


	/*$("#validateError").modal({
	  backdrop: "static", //remove ability to close modal with click
	  keyboard: false, //remove option to close with keyboard
	  show: true //Display loader!
	});*/
}

function pattern()
{
	

	$.validator.addMethod("alphanum", function(value, element) {
  	return this.optional(element)|| /^\w+$/i.test(value);
	});


	$.validator.addMethod("EngNotAllowed", function( value, element ) {
	        var regex = new RegExp("^[^a-zA-Z]*$");
	        var key = value;
	        
	        if (regex.test(key)) {
	           return true;
	        }
	        return false;
	    });

	$.validator.addMethod('time', function(value, element, param) {
	    return value == '' || value.match(/^([01][0-9]|2[0-3]):[0-5][0-9]$/) || value.match(/^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/);
	}, 'Enter a valid time: hh:mm');

	$.validator.addMethod("EngAndSpecialCharNotAllowed", function( value, element ) {
        var regex = new RegExp("^[^a-zA-Z<>\";`%!~#$|+%&*=\[\\]\:^{}?]*$");
        var key = value;
        
        if (regex.test(key)) {
           return true;
        }
        return false;
    });
    $.validator.addMethod("OnlySpecialCharsNotAllowed", function( value, element ) {
        
        // var regex = new RegExp("^[0-9@,-./_]*$");
        var regex = new RegExp("^[^0-9][()@,./\-_:]*$");
        var key = value;
        
        if (regex.test(key)) {
           return false;
        }
        else
        {
        return true;
        }
    });
    $.validator.addMethod("CharCheckForSection", function( value, element ) {
        
         var regexalpha = new RegExp("^[a-zA-Z0-9,()]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) || keyalpha=='') {
           return true;
        }
        return false;
    });


	$.validator.addMethod("specialChars", function( value, element ) {
        var regex = new RegExp("^[^<>\";`%!~#$|+%&*=\[\\]\:^{}?]*$");
        var key = value;
        
        if (regex.test(key)) {
           return true;
        }
        return false;
    });

    $.validator.addMethod("nospecialChars", function( value, element ) {
        //var regex = new RegExp("^[^<>'\"/;`%!~#$%&*()=\[\\]\:{}?@.,_-]*$");
        var regex = new RegExp("^[a-zA-Z]+$");
        var key = value;

        if (regex.test(key)) {
           return true;
        }
        return false;
    });
    $.validator.addMethod("urlspecialChars", function( value, element ) {
        var regex = new RegExp("^[^<>'\";`%!~#$%&*()=\[\\]\^{}?@,]*$");
        var key = value;
        
        if (regex.test(key)) {
           return true;
        }
        return false;
    });

    $.validator.addMethod("alphabet", function( value, element ) {
        var regexalpha = new RegExp("^[a-zA-Z,. ]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) || keyalpha=='') {
           return true;
        }
        return false;
    });
    $.validator.addMethod("password", function( value, element ) {
       	return /^[A-Za-z0-9\d@#$%&*]*$/.test(value) && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[@#$%&*]/.test(value) && /\d/.test(value);
    });
    

    $.validator.addMethod("emailchar", function( value, element ) {
        var regexalpha = new RegExp("^[a-zA-Z0-9@._-]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) || keyalpha=='') {
           return true;
        }
        return false;
    });

    $.validator.addMethod("alphabetnumber", function( value, element ) {
        var regexalpha = new RegExp("^[a-zA-Z0-9, ]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) || keyalpha=='') {
           return true;
        }
        return false;
    });

    $.validator.addMethod("noalphabet", function( value, element ) {
        var regexalpha = new RegExp("^[a-zA-Z]+$");
        var keyalpha = value;

        if (regexalpha.test(keyalpha) && keyalpha!='') {
           return false;
        }
        return true;
    });
    $.validator.addMethod("manual_valid", function( value, element ) {       
	                         return true;
	                        });
	$.validator.addMethod("manual_invalid", function( value, element ) {       
	                         return false;
	                        });
	$.validator.addMethod("notNumber", function(value, element, param) {
           var reg = /[0-9]/;
           var regex = new RegExp("^[0-9()@,-./_]*$");
           var regex1 = new RegExp("^[()@,-./_0-9()@,-./_ ']+( [()@,-./_0-9()@,-./_ ']+)*$");
            //var regex2 = new RegExp("^[0-9@,./_]+( [0-9']+)*$");

                
            
          /* if((!isNaN(value) || value.indexOf(' ') >= 0 || regex.test(value)) && value!="" ){
                 return false;
           }else{
                   return true;
           }
         */
         //if((!isNaN(value) || regex.test(value) || regex1.test(value) || value.indexOf('\\') >= 0) && value!="" )--for not allowing \
            if((!isNaN(value) || regex.test(value) || regex1.test(value) ) && value!="" ){
                 return false;
           }else{
                   return true;
           }    

          

    });



	 $.validator.addMethod("Number", function(value, element, param) {
           var reg =  /^[0-9]+$/;                   
           if (reg.test(value) || value=='') {
                    return true;
            }
            else
            {
                 return false;
            }

    });

	$.validator.addMethod("onlyzeronotallowed", function(value, element, param) {                      
		if( value!='')
	    {

	           if (parseInt(value)>0) {
	                    return true;
	            }
	            else
	            {
	                 return false;
	            }
	    }
	    else
	    {
	         return true;
	    }

    });






	$.validator.addMethod("noNumberAtAll", function(value, element, param) {
           var reg = /[0-9]/;                   
           if (reg.test(value)) {
                    return false;
            }
            else
            {
                 return true;
            }

    });




	$.validator.addMethod("validstring", function(value, element, param) {
       var reg = /(.)\1{2,}/;                   
       if (reg.test(value)) {
                return false;
        }
        else
        {
             return true;
        }

    });

	$.validator.addMethod("validateYear", function(value, element, param) {
	 var curr_year = new Date().getFullYear();
                   			
         if (value<1901 || value>curr_year ) {
		return false;
	 } else	{
		 return true;
	 }

           });



	$.validator.addMethod("date", function(date, element) {
	 //              
	   /*var regDate = /^(((0[1-9]|[12]\d|3[01])\-(0[13578]|1[02])\-((19|[2-9]\d)\d{2}))|((0[1-9]|[12]\d|30)\-(0[13456789]|1[012])\-((19|[2-9]\d)\d{2}))|((0[1-9]|1\d|2[0-8])\-02\-((19|[2-9]\d)\d{2}))|(29\-02\-((1[6-9]|[2-9]\d)(0[48]|[2468][048]|[13579][26])|((16|[2468][048]|[3579][26])00))))$/;
	   if (optional(element) || date.match(regDate))
	    {
	        return true;
	    }
	    return false;*/
	  return this.optional(element) || date.match(/^(((0[1-9]|[12]\d|3[01])\-(0[13578]|1[02])\-((19|[2-9]\d)\d{2}))|((0[1-9]|[12]\d|30)\-(0[13456789]|1[012])\-((19|[2-9]\d)\d{2}))|((0[1-9]|1\d|2[0-8])\-02\-((19|[2-9]\d)\d{2}))|(29\-02\-((1[6-9]|[2-9]\d)(0[48]|[2468][048]|[13579][26])|((16|[2468][048]|[3579][26])00))))$/);
	  });




	$.validator.addMethod("float1", function(value, element) {

       var reg = /^[-+]?\d{0,12}(\.\d{1})?\d{0,2}$/;
       if (reg.test(value)) {
                return true;
        }
        else
        {
             return false;
        }

    });


}


function viewHistory(case_no,cino,sel_court_code,hideparty,caseStatusSearchType,state_code,dist_code,complex_code,search_by)
{
	
	var url="home/viewHistory";

	var send_str="court_code="+sel_court_code;
	send_str+="&state_code="+state_code;
	send_str+="&dist_code="+dist_code;
	send_str+="&court_complex_code="+complex_code;
	send_str+="&case_no="+case_no;
	send_str+="&cino="+cino;
    send_str+="&hideparty="+hideparty;
	send_str+="&search_flag="+caseStatusSearchType;
	send_str+="&search_by="+search_by

	ajaxCall({url:url,postdata:send_str,callback:callbackEST,connection:'N'});
	function callbackEST(obj){  //alert(obj.data_list);
		if(obj.status == 1)
		{ 
			if(obj.search_by=='CSpartyName'){
				$('#partyname_div').hide();
				$('#partyAddress_div').hide(); //-----------village search
				$('#CSpartyName').html(obj.data_list);
				$('#CSpartyName').show();
				$('#main_back_party').show();
				$('#village_party').hide();
				$('.sevenmenu').hide();
				
			}else if(obj.search_by=='CScaseNumber'){
				$('#casenumber_div').hide();
				$('#CScaseNumber').html(obj.data_list);
				$('#CScaseNumber').show();
				$('#main_back_caseNo').show();
				$('.sevenmenu').hide();
			}else if(obj.search_by=='CSfilingNumber'){
				$('#filingnumber_div').hide();
				$('#CSfilingNumber').html(obj.data_list);
				$('#CSfilingNumber').show();
				$('#main_back_filingNo').show();
				$('.sevenmenu').hide();
			}else if(obj.search_by=='CSAdvName'){
				$('#advname_div').hide();
				$('#CSAdvName').html(obj.data_list);
				$('#CSAdvName').show();
				$('#main_back_AdvName').show();
				$('.sevenmenu').hide();
			}else if(obj.search_by=='CSFIRNumber'){
				$('#firnumber_div').hide();
				$('#CSFIRNumber').html(obj.data_list);
				$('#CSFIRNumber').show();
				$('#main_back_Fir').show();
				$('.sevenmenu').hide();
			}else if(obj.search_by=='CSact'){
				$('#act_div').hide();
				$('#CSact').html(obj.data_list);
				$('#CSact').show();
				$('#main_back_act').show();
				$('.sevenmenu').hide();
			}else if(obj.search_by=='CScaseType'){
				$('#casetype_div').hide();
				$('#CScaseType').html(obj.data_list);
				$('#CScaseType').show();
				$('#main_back_caseType').show();
				$('.sevenmenu').hide();
			}else if(obj.search_by=='CauseList'){
				$('#causeList_div').hide();
				$('#CauseList').html(obj.data_list);
				$('#CauseList').show();
				$('#main_back_CauseList').show();
				$('.sevenmenu').hide();
			}else if(obj.search_by=='CaveatSearch'){
				$('#caveat_div').hide();
				$('#CaveatSearch').html(obj.data_list);
				$('#CaveatSearch').show();
				$('#main_back_CaveatSearch').show();
				$('.sevenmenu').hide();
			}else if(obj.search_by=='VillageDispute'){
			//	alert(1111111111);
				$('#village_dispute').hide();
				$('#dispute_div').hide();
				$('.sevenmenu').hide();
				$('#displuteData').html(obj.data_list);
				$('#displuteData').show();
				$('#main_back_dispute').show();
			}
			else if(obj.search_by=='VillageParty'){

				$('#village_party').hide();
				$('#partyAddress_div').hide(); //-----------village search
				$('.sevenmenu').hide();
				$('#villageData').html(obj.data_list); ///-------- history
				$('#villageData').show();
				$('#main_back_party').show();

			}
			
		}
	}

}



//**show business data *************/

function viewBusiness(court_code,dist_code,n_dt,case_number,state_code,businessStatus,todays_date1,court_no,national_court_code,caseStatusSearchType,srno)
{
	
	var url="home/viewBusiness";
	var search_by=caseStatusSearchType;
	//var state_code=$('#sess_state_code').val();
	var dist_code=$('#sess_dist_code').val();
	if(search_by!='cnr'){
	var court_complex_code=$('#court_complex_code').val();
	var court_complex_codeArr=court_complex_code.split('@');
	var differ_mast_est=court_complex_codeArr[2];
	var combo_val=court_complex_code;
    var court_codeArr=court_complex_codeArr[1];
	}
	

	var send_str="court_code="+court_code;
	send_str+="&state_code="+state_code;
	send_str+="&dist_code="+dist_code;
	if(search_by!='cnr'){
	send_str+="&court_complex_code="+court_complex_codeArr[0];
	}
	send_str+="&nextdate1="+n_dt;
	send_str+="&case_number1="+case_number;
	send_str+="&state_code="+state_code;
	send_str+="&disposal_flag="+businessStatus;
	send_str+="&businessDate="+todays_date1;
	send_str+="&national_court_code="+national_court_code;
	send_str+="&court_no="+court_no;
	send_str+="&search_by="+caseStatusSearchType;
	send_str+="&srno="+srno;
	
	ajaxCall({url:url,postdata:send_str,callback:callbackComplex,connection:'N'});
		function callbackComplex(obj){  //alert(obj.data_list);
		
			//$("#printDiv").show();
			if(	search_by=='CSpartyName'){
				$('#history').hide();
				$('#CSpartyName').hide();
				$('#main_back_party').hide();				
				$("#caseBusinessDiv_csParty").show();
				$("#caseBusinessDiv_csParty").html(obj.data_list);	
				 $("#printDiv").show();
			}else if(search_by=='CScaseNumber'){
				$('#history').hide();
				$('#CScaseNumber').hide();
				$('#main_back_caseNo').hide();						
				$("#caseBusinessDiv_csNo").show();
				$("#caseBusinessDiv_csNo").html(obj.data_list);	
				 $("#printDiv_csNo").show();
			}else if(search_by=='CSfilingNumber'){
				$('#history').hide();
				$('#CSfilingNumber').hide();
				$('#main_back_filingNo').hide();						
				$("#caseBusinessDiv_filingNo").show();
				$("#caseBusinessDiv_filingNo").html(obj.data_list);
				$("#printDiv_filingno").show();	
			}else if(search_by=='CSAdvName'){
				$('#history').hide();
				$('#CSAdvName').hide();
				$('#main_back_AdvName').hide();						
				$("#caseBusinessDiv_AdvName").show();
				$("#caseBusinessDiv_AdvName").html(obj.data_list);	
				$("#printDiv_advnm").show(); 
			}else if(search_by=='CSFIRNumber'){
				$('#history').hide();
				$('#CSFIRNumber').hide();
				$('#main_back_Fir').hide();						
				$("#caseBusinessDiv_Fir").show();
				$("#caseBusinessDiv_Fir").html(obj.data_list);	
				$("#printDiv_fir").show();
			}else if(search_by=='CSact'){
				$('#history').hide();
				$('#CSact').hide();
				$('#main_back_act').hide();						
				$("#caseBusinessDiv_act").show();
				$("#caseBusinessDiv_act").html(obj.data_list);	
				 $("#printDiv_act").show();
			}else if(search_by=='CScaseType'){
				$('#history').hide();
				$('#CScaseType').hide();
				$('#main_back_caseType').hide();						
				$("#caseBusinessDiv_caseType").show();
				$("#caseBusinessDiv_caseType").html(obj.data_list);	
				 $("#printDiv_fir").show();
			}else if(search_by=='CauseList'){
				$('#history').hide();
				$('#CauseList').hide();
				$('#main_back_CauseList').hide();						
				$("#caseBusinessDiv_CauseList").show();
				$("#caseBusinessDiv_CauseList").html(obj.data_list);	
				$("#printDiv_causelist").show();
			}else if(search_by=='cnr'){
				$('#history_cnr').hide();
				$('#cnr_div').hide();
				$('#main_back_cnr').hide();	
				$('#help_cnr').hide();	
				$("#caseBusinessDiv_cnr").show();
				$("#caseBusinessDiv_cnr").html(obj.data_list);	
				$("#printDiv_cnr").show();
			}
		}
				
	}



	function viewIABusiness(ia_no,cinoia,ia_case_type_name,ia_filno,ia_filyear,national_court_code,caseStatusSearchType)
	{


			var url="home/viewIABusiness";
			var search_by=caseStatusSearchType;
			
			var state_code=$('#sess_state_code').val();
			var dist_code=$('#sess_dist_code').val();
			if(search_by!='cnr'){
				var court_complex_code     = $('#court_complex_code').val();
				var court_complex_codeArr = court_complex_code.split('@');
				var differ_mast_est           = court_complex_codeArr[2];
				var combo_val					  = court_complex_code;
				var court_codeArr				  = court_complex_codeArr[1];
			}
		

			//var send_str="court_code="+court_code;
			var  send_str ="state_code="+state_code;
			send_str+="&dist_code="+dist_code;

			if(search_by!='cnr'){
				send_str+="&court_complex_code="+court_complex_codeArr[0];
			}
			send_str+="&ia_no="+ia_no;
			send_str+="&cinoia="+cinoia;
			send_str+="&ia_case_type_name="+ia_case_type_name;
			send_str+="&ia_filno="+ia_filno;
			send_str+="&ia_filyear="+ia_filyear;
			send_str+="&national_court_code="+national_court_code;
			send_str+="&search_by="+caseStatusSearchType;

			
			ajaxCall({url:url,postdata:send_str,callback:callbackComplex,connection:'N'});
			function callbackComplex(obj){  //alert(obj.data_list);

				 $('#modal_ia_business_body').html(obj.data_list);
				
			
			}
				
		}




function viewBusinessCaveat(caveat_no,caveat_disp_no,court_code,search_flag,state_code,dist_code,court_complex_code)
{	
	var url="home/caveat_search_case_history";
	var send_str="caveat_no="+caveat_no;
	send_str+="&caveat_disp_no="+caveat_disp_no;
	send_str+="&court_code="+court_code;
	send_str+="&search_flag="+search_flag;
	send_str+="&state_code="+state_code;
	send_str+="&dist_code="+dist_code;
	send_str+="&court_complex_code="+court_complex_code;
		$('#main_back_CaveatSearch').hide();			
	
	ajaxCall({url:url,postdata:send_str,callback:callbackComplex,connection:'N'});
		function callbackComplex(obj){ 
			if(obj.status == 1)
			{ 
				$('#history_caveat').hide();
				//$('#res_caveat_search').hide();
				//$('#how_to_caveat').hide();
				$('#main_back_CaveatSearch').show();	
				$('#caveat_div').hide();	
				$("#caseBusinessDiv_CaveatSearch").show();
				$("#caseBusinessDiv_CaveatSearch").html(obj.data_list);	
			}
						
		}

}

function showProcess()
{

	
	var process_id=$('#fprocess_id').val();
	var fcaptcha_code=$('#fcaptcha_code').val();
	$('#hdn_process_id').val(process_id);
	var femail_id = $('#femail_id').val();

	
	if(validateProcess()){
			//alert(112345);
	var url="processDetails/showProcess";
	var send_str="&fcaptcha_code="+fcaptcha_code+"&process_id="+process_id+"&femail_id="+femail_id;
	//alert(send_str);
	//$('#modal_process_data').modal('show');
	$('#proc_msg').show();
	
	ajaxCall({url:url,postdata:send_str,callback:callbackComplex,connection:'N'});
	function callbackComplex(obj){ 
			if(obj.status==0)
			{
				$('#modal_process_data').modal('hide');
				$("#fcaptcha_code").val('');
				captcha_image_audioObj.refresh();
				document.getElementById('captcha_image').src = 'vendor/securimage/securimage_show.php? ' + Math.random(); this.blur();
				return false;
			}
			else if(obj.status == 1)
			{ 
				$('#modal_process_data').show();
				$('#modal_process_data').modal('show');
				$('#proc_msg').show();
				$('#modal_process_body').html(obj.str);
				$('#fcaptcha_code').val('');
			}
					
	}
	}


}
function validateProcess()
{
	//alert(1);
	$("#frmprocess").validate();
    pattern();
   
   
	 $('#fprocess_id').rules('add', {
		required:true,	
		//maxlength : 4,
        messages: {
		 required : 'Please Enter Process ID',
        }
    });
   
	$('#femail_id').rules('add', {
		required:true,
		email:true,
        messages: {
		 required : 'Please Enter Email Id',
        }
    });
  
    if(!$('#frmprocess').valid())
        $('.error').first().focus();
    return $('#frmprocess').valid();


}
let countdownInterval1;
function ModalsendOtp(process_id,user_email,usermobno,addressee_type){

   $('#modal_process_data').show();
	$("#div_otp_modal").show();
	$("#gotp").hide();
	$("#proc_msg").hide();
	$("#user_otp").val('');

	 $('#hdn_addressee_type').val(addressee_type);

	//alert(user_email+"---"+addressee_type);
	/*var usermobno = encodeURIComponent($('#user_mobile').val());
	
	var processid = encodeURIComponent($('#hdn_process_id').val());*/
	var user_email = encodeURIComponent(user_email);
	var usermobno = encodeURIComponent(usermobno);
	//var sparty_email = encodeURIComponent(sparty_email);

	$('#user_email').val(user_email);
	$('#user_mobile').val(usermobno);
	$('#hdn_process_id').val(process_id);
	$('#hdn_sparty_email').val(user_email);

	var url = "processDetails/sendotp";

	var postdata ="mobile="+usermobno+"&user_email="+user_email+"&processid="+process_id+"&hdn_addressee_type="+addressee_type //processid="+pid+"&

	ajaxCall({url:url,postdata:postdata,callback:callbackParty,connection:'N'});
	function callbackParty(result)
	{  
		
		//alert(result.status);
		if(result.status == 1)
		{ 	
			//alert(result.hdn_otp);
				if (result.sent == "Y")
			{
                $('#div_send_otp_msg').show();
                $('#div_send_otp_msg').html(result.otp_msg);
                $('#div_send_otp_msg').val(result.sent_message);
				$("#hdn_otp").val(result.hdn_otp);
               /* $("#inputbox").hide();
                $("#otpbox").show();*/
                $("#waitmsg").html("Please enter the verification code sent via Email <br>Do not refresh or close this window.");


                $("#verifyotp").attr("disabled", false);
                $("#sendOtp").attr("disabled", true);

                $("#resendbtn").attr("disabled", true);
               startOtpTimer(20); // Start 2-minute timer
            } else {
                $("#sendOtp").attr("disabled", true);
            }
		}	

	}
}
function startOtpTimer(duration) {
    let timer = duration;
    const display = document.getElementById("timerotp");

    clearInterval(countdownInterval1); // Stop any previous timer

    countdownInterval1 = setInterval(function () {
        let minutes = Math.floor(timer / 60);
        let seconds = timer % 60;

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        //display.textContent = "Resend OTP available in " + minutes + ":" + seconds;
		display.textContent = " " + minutes + ":" + seconds;
        if (--timer < 0) {
            clearInterval(countdownInterval1);
            display.textContent = ""; // Clear the timer display
            document.getElementById("resendbtn").disabled = false;
            $("#waitmsg").html('');
        }
    }, 1000);
}



let attempts=0;
function verify_otp_modal()
{
	//var user_otp =  encodeURIComponent($('#user_otp').val());
	var user_otp = btoa($('#user_otp').val());
	var hdn_process_id = ($('#hdn_process_id').val());
	//var hdn_sparty_email = ($('#hdn_sparty_email').val());
	var hdn_addressee_type = ($('#hdn_addressee_type').val());
//	alert(user_otp+hdn_addressee_type);
	
	 // Tracks the number of incorrect OTP attempts
     const maxAttempts = 5; // Maximum number of attempts allowed
	 var correctOtp =$('#hdn_otp').val();
	// alert(correctOtp+"=="+user_otp);
		if (correctOtp == user_otp) {
		//alert('OTP correct!');
		  attempts = 0; // Reset on success
		} else {
			
			attempts++;
		//alert( attempts+"==="+maxAttempts);
		console.log('Failed attempt, attempts now: ' + attempts); // Debugging line
		
		if (attempts>maxAttempts) {
			
			$('#proc_msg').show();// Show error message after max attempts
			$('#gotp').show();
			$('#div_send_otp_msg').hide();
			$('#div_otp_modal').hide();
			$('#submitOtp').prop('disabled', true); // Disable the OTP submit button
			attempts = 0;
			$('#hdn_otp').val('');
			//return false;
		} else {
			//alert(111111);
			alert('You have ' + (maxAttempts - attempts) + ' attempts left');//You have ' + (maxAttempts - attempts) + ' attempts left.'
			//return false;
		}
		}
	var postdata="process_id="+hdn_process_id+"&user_otp="+user_otp+"&addressee_type="+hdn_addressee_type;


	var url = "processDetails/verify_otp";

	ajaxCall({url:url,postdata:postdata,callback:callbackParty,connection:'N'});
	function callbackParty(result)
	{  
		
		//alert(result.status);
		if(result.status == 1)
		{ 	
			$('#modal_process_data').hide();
			//alert(result.sent);
			//if (result.sent == "Y")
			{
                /*$('#send_otp_msg').show();
                $('#send_otp_msg').html(result.otp_msg);
                $('#sent_message').val(result.sent_message);

             
                $("#waitmsg").html("Please enter the 6-digit code sent via SMS <br>Do not refresh or close this window.");


                $("#verifyotp").attr("disabled", false);
                $("#sendOtp").attr("disabled", true);

                $("#resendbtn").attr("disabled", true);
                startOtpTimer(120); // Start 2-minute timer*/

				if(window.matchMedia("(max-width: 767px)").matches)
				{
						//window.location.replace("https://services.ecourts.gov.in/ecourtindia_v6/"+result.order);
						window.open("https://services.ecourts.gov.in/ecourtindia_v6/" + result.order, '_blank');

				}else
				{ 
					 $('#user_otp').val('');
					 $("#p_order").val(result.order);

						file_name="<object data='"+result.order+"' height='100%' width='100%' style='min-height:600px;'></object>";
						//alert(file_name);
						$("#modal_order_body").show().html(file_name);
						var myModal = new bootstrap.Modal($('#modalOders'), {
						backdrop: "static", //remove ability to close modal with click
						keyboard: false, //remove option to close with keyboard
						show: true //Display loader!
				});
				}
				myModal.toggle();

            } /*else {
                $("#sendOtp").attr("disabled", true);
            }*/
		}else if (result.flag == 2) { 
           // alert(result.errormsg);  // Show the message from PHP
		    $("#gotp").show();
			$("#proc_msg").show();
			$("#div_otp_modal").hide();
        }

	}
	

}
 function isNumber(event) {
    var charCode = (event.which) ? event.which : event.keyCode; // Get keyCode for the pressed key
    if (charCode >= 48 && charCode <= 57) { // Check if key is a number (0-9)
      return true;
    } else {
      return false; // Prevent input if it's not a number
    }
  }


function back_fun(search_flag)
{

	 
	if(search_flag=='CSpartyName'){
		$('#caseBusinessDiv_csParty').hide();
		$('#CSpartyName').show();
		$('#main_back_party').show();
		$("#printDiv").hide();
	}else if(search_flag=='CScaseNumber'){
		$("#caseBusinessDiv_csNo").hide();
		$('#CScaseNumber').show();
		$('#main_back_caseNo').show();	
		 $("#printDiv_csNo").hide();						
	}else if(search_flag=='CSfilingNumber'){
		$("#caseBusinessDiv_filingNo").hide();
		$('#CSfilingNumber').show();
		$('#main_back_filingNo').show();							
		$("#printDiv_filingno").hide();
	}else if(search_flag=='CSAdvName'){
		$("#caseBusinessDiv_AdvName").hide();
		$('#CSAdvName').show();
		$('#main_back_AdvName').show();							
		$("#printDiv_advnm").hide();
	}else if(search_flag=='CSFIRNumber'){
		$("#caseBusinessDiv_Fir").hide();
		$('#CSFIRNumber').show();
		$('#main_back_Fir').show();							
		 $("#printDiv_fir").hide();
	}else if(search_flag=='CSact'){
		$("#caseBusinessDiv_act").hide();
		$('#CSact').show();
		$('#main_back_act').show();							
		$("#printDiv_act").hide();
	}else if(search_flag=='CScaseType'){
		$("#caseBusinessDiv_caseType").hide();
		$('#CScaseType').show();
		$('#main_back_caseType').show();							
		$("#printDiv_casetype").hide();
	}else if(search_flag=='CauseList'){
		$("#caseBusinessDiv_CauseList").hide();
		$('#CauseList').show();
		$('#main_back_CauseList').show();							
		$("#printDiv_causelist").hide();
	}else if(search_flag=='CaveatSearch'){
		$("#caseBusinessDiv_CaveatSearch").hide();
		$('#CaveatSearch').show();
		$('#main_back_CaveatSearch').show();							
		$("#printDiv_cavaeat").hide();
	}else if(search_flag=='cnr'){
		$("#caseBusinessDiv_cnr").hide();
		$('#history_cnr').show();
		$('#cnr_div').hide();
		$('#main_back_cnr').show();		
		$('#help_cnr').hide();	
		$("#printDiv_cnr").hide();
	}
	
}

function main_back(flag)
{
	if(flag==='CSpartyName')
	{
		$('#caseBusinessDiv_csParty').hide();
		$('#CSpartyName').hide();
		$('#res_party').show();
		$('#partyname_div').show();
		$('#partyAddress_div').show();
		$('#main_back_party').hide();
		$('.sevenmenu').show();
	//	$('#village_party').show();
		
	}else if(flag==='CScaseNumber')
	{
	$('#caseBusinessDiv_csNo').hide();
	$('#CScaseNumber').hide();
	$('#casenumber_div').show();
	$('#main_back_caseNo').hide();
	$('#case_no_res').show();
		$('.sevenmenu').show();
	}else if(flag==='CSfilingNumber')
	{
	$('#caseBusinessDiv_filingNo').hide();
	$('#CSfilingNumber').hide();
	$('#filingnumber_div').show();
	$('#main_back_filingNo').hide();
	$('#res_filing').show();
		$('.sevenmenu').show();
	}else if(flag==='CSAdvName')
	{
	$('#caseBusinessDiv_AdvName').hide();
	$('#CSAdvName').hide();
	$('#advname_div').show();
	$('#main_back_AdvName').hide();
	$('#res_adv_name').show();
	$('.sevenmenu').show();
	}else if(flag==='CSFIRNumber')
	{
	$('#caseBusinessDiv_Fir').hide();
	$('#CSFIRNumber').hide();
	$('#firnumber_div').show();
	$('#main_back_Fir').hide();
	$('#res_fir').show();
		$('.sevenmenu').show();
	}else if(flag==='CSact')
	{
	$('#caseBusinessDiv_act').hide();
	$('#CSact').hide();
	$('#act_div').show();
	$('#main_back_act').hide();
	$('#res_act').show();
		$('.sevenmenu').show();
	}else if(flag==='CScaseType')
	{
	$('#caseBusinessDiv_caseType').hide();
	$('#CScaseType').hide();
	$('#casetype_div').show();
	$('#main_back_caseType').hide();
	$('#res_case_type').show();
		$('.sevenmenu').show();
	}else if(flag==='CauseList')
	{
	$('#caseBusinessDiv_CauseList').hide();
	$('#CauseList').hide();
	$('#causeList_div').show();
	$('#main_back_CauseList').hide();
	$('#res_cause_list').show();
		$('.sevenmenu').show();
	}else if(flag==='CaveatSearch')
	{
	$('#caseBusinessDiv_CaveatSearch').hide();
	$('#CaveatSearch').hide();
	$('#caveat_div').show();
	$('#main_back_CaveatSearch').hide();
	$('#res_caveat_search').show();
		$('.sevenmenu').show();
	}else if(flag==='cnr')
	{
	$('#history_cnr').hide();
	$('#cnr_div').show();
	$('#main_back_cnr').hide();
	$('#caseBusinessDiv_cnr').hide();
	$('#help_cnr').show();	
	}
	else if(flag==='VillageDispute')
	{
	$('#displuteData').hide();
	$('#village_dispute').show();
	$('#main_back_dispute').hide();
	$('#caseBusinessDiv').hide();
	$('.sevenmenu').show();
	$('#dispute_div').show();
	}
	else if(flag==='VillageParty')
	{
	$('#villageData').hide();
	$('#village_party').show();
	$('#main_back_party').hide();
	$('#caseBusinessDiv').hide();
	$('.sevenmenu').show();
	$('#partyAddress_div').show();
		$('.sevenmenu').show();
	}
}

function printContent(id){

	//$("#caseBusinessDiv").show();
	// divContents = $('#caseBusinessDiv').html()
	$("#"+id).show();
	var divContents = $("#mydiv").html();
	// $('#allbk_btn').hide();
	var printWindow = window.open('', '', 'height=400,width=800');
	printWindow.document.write(divContents);
	 //$('#allbk_btn').hide();
	printWindow.document.close();
	printWindow.print();
	

}

function printContent_data()
{
	window.print();
}

function reg_lang(setPramukeLang)
{
	//var sesslangid;
//alert(setPramukeLang);

	if(setPramukeLang=='N')
	{
		pramukhIME.addLanguage(PramukhIndic,"english"); 
		pramukhIME.enable();
	}
	else
	{
		if(setPramukeLang=='Y')
		{
		//var pramukhe_lang="<?php echo  $sessSelLang;?>";
	var pramukhe_lang= $("#hdn_lang").val();

		//alert(pramukhe_lang);
		pramukhIME.addLanguage(PramukhIndic,pramukhe_lang); 
		pramukhIME.enable();
		}
		else
		{
			pramukhIME.addLanguage(PramukhIndic,"english"); 
			pramukhIME.enable();
		}
	}
	
}


function validate_state_dist_complex()
{

	var state_code    = $("#sess_state_code").val() ;
	var dist_code     = $('#sess_dist_code').val();
	var courtArr      = $('#court_complex_code').val();
	var court_est_arr = courtArr.split('@');
	var court_complex = court_est_arr[0];
	var est_code      = $('#court_est_code').val();

	if(state_code==0  )
	{
		errorAlert(alerts_array[52]);
		return false;
	}

	if(dist_code==0 )
	{
		errorAlert(alerts_array[49]);
		return false;
	}

	if(court_complex==0 )
	{
		errorAlert(alerts_array[277]);
		return false;
	}
	return true;
	
}

function highLightWord()
{

		var option = {
                color: "black",
                background: "yellow",
                bold: false,
                class: "high",
                ignoreCase: true,
                wholeWord: false
        }
		var originalContent = $("tbody").html();
		if(isNaN($("#txtSearch").val()))
	{
			searchCnt = $("tbody").highlight($("#txtSearch").val(), option);
			$("#matcheCnt").text(searchCnt+" matches");
	}
	else
	{
		
		$('#bs_alert').modal('show');
        $("#bs_alert .modal-body").text("Please search text");
	}
	

}


function checkDateInpuWithNextMonth(objVal) 
{
 //get today's date in string
 var todayDate = new Date();
 var todayMonth = todayDate.getMonth() + 1;
 var todayDay = todayDate.getDate();
 var todayYear = todayDate.getFullYear();
 var todayDateText =  todayMonth +  "/" + todayDay +"/" + todayYear;

 var nextMonth = new Date();
 //31 days after
 nextMonth.setTime(nextMonth.valueOf() +32 * 24 * 60 * 60 * 1000);

 var prevDay = nextMonth.getDate();
 var prevMonth = nextMonth.getMonth() + 1;
 var prevYear = nextMonth.getFullYear();
 var nextMonthText = prevMonth + "/" +  prevDay + "/" +prevYear;

//get date input from SharePoint DateTime Control
////var inputDateText = document.getElementById('causelist_date').value;

var inputDateText =objVal;
var dateString =  inputDateText.replace(/\-/g, '/');
var dateString_arr=dateString.split('/');
dateString =dateString_arr[1]+'/'+dateString_arr[0]+'/'+dateString_arr[2];


//Convert both input to date type
 var inputToDate = Date.parse(dateString);
 var todayToDate = Date.parse(todayDateText);
 var nextMonthToDate = Date.parse(nextMonthText);
 

  if (inputToDate < nextMonthToDate)
  {    
    
    return true;
  }
  else
  {    
    
    return false;
    
   }
 }



