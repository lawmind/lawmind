
//$(function() { //shorthand document.ready function
$( document ).ready(function() {
$(document).on('input', '#txtSearch', function () {
    this.value = this.value.replace(/[^a-zA-Z0-9._,\-/ ]/g, '');
});

setTimeout(function(){refreshCaptcha('onload')},200);

var selected_state_code=$('#sess_state_code').val();
var session_differ_mast_est = $('#session_differ_mast_est').val();


//alert(selected_state_code);	
if(selected_state_code!=0 && selected_state_code!=undefined)
	fillDistrict(selected_state_code);

var selected_dist_code =$('#sess_dist_code').val();
var selected_district_code =$('#sees_district_code').val();


//alert(selected_state_code+"=="+selected_dist_code+"=="+selected_district_code);
if( selected_district_code!=0 && selected_district_code!=undefined )
	setTimeout(function(){fillCourtComplex(selected_district_code)},600);


var selected_complex_code = $('#sees_complex_code').val();
var sees_est_code = $('#sees_court_est_code').val();
var search_type = $("#s_type").val();

if(search_type=='cause'){
	 setTimeout(function(){fillCauseList()},700);
}
//alert("est=="+sees_est_code);
//if(sees_est_code!=0 && selected_district_code!=0)
if(session_differ_mast_est=='Y' && session_differ_mast_est!=undefined)
{
	setTimeout(function(){
		$("#est_codes").show();
		fillEst();
	},800);
}



//alert($("#s_type").val());
//alert(1);
 });


$("#leftPaneMenuCS").click(function(){
	$("#location_checked").val("N");	
});

$("#leftPaneMenuCL").click(function(){
	$("#location_checked").val("N");	

});

$("#leftPaneMenuCavet").click(function(){
	$("#location_checked").val("N");	

});

$("#leftPaneMenuCO").click(function(){
$("#location_checked").val("N");	

});

$("#leftPaneMenuCnr").click(function(){
	  $("#location_checked").val("N");	
});


$("#leftPaneMenuLocation").click(function(){
		$("#location_checked").val("Y");	
});

$("#leftPaneMenuvillageSearch").click(function(){
		$("#location_checked").val("N");	
});

$("#leftPaneMenuprocessDetails").click(function(){
		$("#location_checked").val("N");	
});

function set_data() {
setTimeout(function(){
		var complex_code = $("#court_complex_code").val();
		var est_code = $("#court_est_code").val(); //alert("est="+est_code);
		if(complex_code!='' || est_code!='' ) {
		//setTimeout(function(){fadeout()},100);
		var selected_state_code=$('#sess_state_code').val();
		var selected_dist_code = $('#sess_dist_code').val();	
		

		var url="casestatus/set_data";
		var postdata ="complex_code="+complex_code+"&selected_state_code="+selected_state_code+"&selected_dist_code="+selected_dist_code+"&selected_est_code="+est_code;
		//alert(postdata);
		ajaxCall({url:url,postdata:postdata,callback:callbackEST,connection:'N'});
		function callbackEST(obj){ 
			//setTimeout(function(){fadeout()},700);
			$("#sees_complex_code").val(obj.complex_code);
			//	$("#sees_dist_code").val(obj.dist_code);
			$("#sees_district_code").val(obj.dist_code);
			$("#sees_court_est_code").val(obj.est_code);
			$('#session_differ_mast_est').val(obj.differ_mast_est);
		
			
		}
		
	}
	//refreshCaptcha();	
	},
		1000);
	
}

/*function set_state()
{
	setTimeout(function(){
		
		var selected_state_code=$('#sess_state_code').val();
			
		
		if(selected_state_code==0)
		{
			//alert("Select state, district and court complex to proceed further");
			$('#bs_alert').modal('show');
			$("#bs_alert .modal-body").text("Select state, district and court complex to proceed further");

		}
		var url="villageSearch/set_state";
		var postdata ="selected_state_code="+selected_state_code;
		//alert(postdata);
		ajaxCall({url:url,postdata:postdata,callback:callbackEST,connection:'N'});
		function callbackEST(obj){ 
			//alert(obj.state_list);
			//setTimeout(function(){fadeout()},700);
			$("#village_state_code").html(obj.state_list);
			$("#village_state_coded").html(obj.state_list);
			
		}
	},	1200);

}

*/

function refreshCaptcha(flag='')
{
	setTimeout(function(){
	var url="casestatus/getCaptcha";

	var postdata =""
	//alert(postdata);
	ajaxCall({url:url,postdata:postdata,callback:callbackEST,loader:false});
	function callbackEST(obj){
		
		var capchacode=obj.div_captcha;
	
		
		var caseStatusSearchID=$('.tabs.active').attr('id')
		if(caseStatusSearchID!=undefined)
		{
			var tabid_arr = caseStatusSearchID.split('-');
			var tab_id    = tabid_arr[0];
			 
			if(tab_id=='partyname')
			{
				if(flag!='onload'){
					$("#fcaptcha_code").focus();
				}
				$('#div_captcha_party').html(capchacode);
				$('#div_captcha_order_party').html(capchacode);

			}else if(tab_id=='casenumber')
			{
					if(flag!='onload'){
						$("#case_captcha_code").focus();
					}
				$('#div_captcha_caseno').html(capchacode);
				$('#div_captcha_order_case').html(capchacode);

			}else if(tab_id=='filingnumber')
			{
					if(flag!='onload'){
						$("#file_captcha_code").focus();
					}
				$('#div_captcha_fileno').html(capchacode);
			}else if(tab_id=='advname')
			{
					if(flag!='onload'){
						$("#adv_captcha_code").focus();
					}
				$('#div_captcha_adv').html(capchacode);
			}else if(tab_id=='firnumber')
			{
				$("#fir_captcha_code").focus();
				$('#div_captcha_fir').html(capchacode);
			}
			else if(tab_id=='act')
			{
					if(flag!='onload'){
						$("#act_captcha_code").focus();
					}
				$('#div_captcha_act').html(capchacode);
			}else if(tab_id=='casetype')
			{
					if(flag!='onload'){
						$("#ct_captcha_code").focus();
					}
				$('#div_captcha_ct').html(capchacode);
			}
			else if(tab_id=='courtnumber')
			{
					if(flag!='onload'){
						$("#order_no_captcha_code").focus();
					}
				$('#div_captcha_court_no').html(capchacode);
			}else if(tab_id=='orderdate')
			{
					if(flag!='onload'){
						$("#order_date_captcha_code").focus();
					}
				$('#div_captcha_order_date').html(capchacode);
			}
			else
			{
					if(flag!='onload'){
						$("#fcaptcha_code").focus();
					}
				$('#div_captcha_cnr').html(capchacode);
				$('#div_captcha_cause_list').html(capchacode);
				$('#div_captcha_caveat').html(capchacode);
			}
		}
		else
		{
			if(flag!='onload'){
				$("#fcaptcha_code").focus();
			}
			$('#div_captcha_cnr').html(capchacode);
			$('#div_captcha_cause_list').html(capchacode);
			$('#div_captcha_caveat').html(capchacode);
		}
	}
	},1000);
}

function validateStateDistCourt(caseStatusSearchID)
{
	$('#village_party').html('');
	$('.modal-backdrop').hide();
	var app_token=$('#app_token').val();
	//alert(app_token);
	var tabid_arr = caseStatusSearchID.split('-');
	var tab_id    = tabid_arr[0]; //alert("tab_id"+tab_id);
	var courtArr=$('#court_complex_code').val();
	var court_est_arr=courtArr.split('@');
	var flag=court_est_arr[2];
	//alert($("#court_est_code").val());
	if(flag=='Y' && $("#court_est_code").val()==0){
	    alert("Select Establishment");
		 return  false;
	}

	var url="casestatus/getCaptcha";
	$("#active_tab").val(tab_id);

	var postdata =""

	ajaxCall({url:url,postdata:postdata,callback:callbackEST,connection:'N'});
	function callbackEST(obj){
		//alert(obj.div_captcha)
		var capchacode=obj.div_captcha;
		//alert(tab_id)
		if(tab_id=='partyname')
		{

			$('.modal-backdrop').hide();

			$('#div_captcha_caseno').html(''); 
			$('#div_captcha_fileno').html('');			
			$('#div_captcha_fir').html('');
			$('#div_captcha_adv').html('');                      
	        $('#div_captcha_ct').html('');
            $('#div_captcha_adv').html('');

			$('#div_captcha_party').html(capchacode);
			$('#div_captcha_order_party').html(capchacode);
			$("#petres_name").val('');
			$("#rgyearP").val('');
			$("#res_party").html('');
			$("#partynameOrder").val('');
			$("#rgyearOrder").val('');
			$("#co_party").html('');
		}else if(tab_id=='casenumber')
		{
			$('.modal-backdrop').hide();

			$('#div_captcha_party').html('');
			$('#div_captcha_order_party').html('');
			$('#div_captcha_order_case').html('');
			$('#div_captcha_order_date').html('');
			$('#div_captcha_fileno').html(''); 
			$('#div_captcha_adv').html('');
			$('#div_captcha_fir').html('');
			$('#div_captcha_adv').html('');
            $('#div_captcha_ct').html('');


			$('#div_captcha_caseno').html(capchacode);
			$('#div_captcha_order_case').html(capchacode);
			$("#case_type").val('');
			$("#search_case_no").val('');
			$("#rgyear").val('');
			$("#case_no_res").html('');
			$("#cocase_no_res").html('');
			$("#rgyearCaseOrder").val('');

			
			
		}else if(tab_id=='filingnumber')
		{
			
			$('#div_captcha_party').html('');
			$('#div_captcha_order_party').html('');
			$('#div_captcha_caseno').html(''); 			
			$('#div_captcha_adv').html('');
			$('#div_captcha_fir').html('');
			$('#div_captcha_adv').html('');
             $('#div_captcha_ct').html('');


			$('.modal-backdrop').hide();
			$('#div_captcha_fileno').html(capchacode);
			$("#filing_no").val('');
			$("#filyear").val('');
			
			$("#res_filing").html('');

		}else if(tab_id=='advname')
		{

			$('#div_captcha_party').html('');
			$('#div_captcha_order_party').html('');
			$('#div_captcha_caseno').html(''); 
			$('#div_captcha_fileno').html('');			
			$('#div_captcha_fir').html('');
			$('#div_captcha_act').html('');
                        $('#div_captcha_adv').html('');


			$('.modal-backdrop').hide();
			$('#div_captcha_adv').html(capchacode);
			$("#advocate_name").val('');
			$("#res_adv_name").html('');

		}else if(tab_id=='firnumber')
		{

			$('#div_captcha_party').html('');
			$('#div_captcha_order_party').html('');
			$('#div_captcha_caseno').html(''); 
			$('#div_captcha_fileno').html('');
			$('#div_captcha_act').html('');
			$('#div_captcha_adv').html('');
	
			$('.modal-backdrop').hide();
			$('#div_captcha_fir').html(capchacode);
			$("#police_st_code").val('');
			$("#fir_no").val('');
			$("#firyear").val('');
			$("#res_fir").html('');

		}else if(tab_id=='act')
		{
			$('#div_captcha_party').html('');
			$('#div_captcha_order_party').html('');
			$('#div_captcha_caseno').html(''); 
			$('#div_captcha_fileno').html(''); 
			$('#div_captcha_adv').html('');
			$('#div_captcha_fir').html(''); 
			$('#div_captcha_ct').html('');


			$('.modal-backdrop').hide();
			$('#div_captcha_act').html(capchacode);
			$("#search_act").val('');
			$("#actcode").val('');
			$("#under_sec").val('');
			$("#res_act").html('');

		}
		else if(tab_id=='casetype')
		{
			$('#div_captcha_party').html('');
			$('#div_captcha_order_party').html('');
			$('#div_captcha_caseno').html(''); 
			$('#div_captcha_fileno').html(''); 
			$('#div_captcha_adv').html('');
			$('#div_captcha_fir').html(''); 
			$('#div_captcha_act').html(''); 

			$('.modal-backdrop').hide();
			$('#div_captcha_ct').html(capchacode);
			$("#case_type_1").val('');
			$("#search_year").val('');
			$("#res_case_type").html('');
		}
		
		else if(tab_id=='courtnumber')
		{
			$('#div_captcha_order_party').html('');
			$('#div_captcha_order_case').html('');
			$('#div_captcha_order_date').html('');
	
		
				$('.modal-backdrop').hide();
				$('#div_captcha_order_date').html(capchacode);
				//$("#nnjudgecode1").val('');
				$("#nnjudgecode1").html('');
				$("#showList_courtno").html('');
				//showList2
				$("#showList2").html('');


		}else if(tab_id=='orderdate')
		{
			$('#div_captcha_order_party').html('');
			$('#div_captcha_order_case').html('');	
			$('#div_captcha_court_no').html('');

				$('.modal-backdrop').hide();
				$('#div_captcha_order_date').html(capchacode);
				$("#from_date").val('');
				$("#to_date").val('');
				$("#coorderdt").html('');

		}
		else if(tab_id=='partyaddress')
		{
			$('#partyAddress_div').show();
			$('#dispute_div').hide();
			resetvillageData();

		}else if(tab_id=='dispute')
		{
			$('#partyAddress_div').hide();
			$('#dispute_div').show();
			
			resetvillageData();

		}
		
		
	 // });
	  
		var state_code=$('#sess_state_code').val();
		var dist_code=$('#sess_dist_code').val(); 
		var court_complex_code= $('#court_complex_code').val();  
		var court_complex_codeArr=court_complex_code.split('@');
		var combo_val=court_complex_code;
		var court_codeArr=court_complex_codeArr[1];
		
		tabid_arr = caseStatusSearchID.split('-');
		tab_id    = tabid_arr[0]; //alert("tab_id"+tab_id);
		if(court_codeArr=='')
		{
			court_codeArr=0;
		} 

		if(state_code==0 || dist_code==0 || court_complex_code==0 )
		{
			
			$("#"+tab_id+"_div").hide();
		
			$('#bs_alert').modal('show');
			$("#bs_alert .modal-body").text("Select state, district and court complex to proceed further");
		   
			if(state_code==0)
			{
				$('#sess_state_code').focus();
			
			}
			if(dist_code==0)
			{
				$('#sess_dist_code').focus();
			}
			if(court_complex_code==0)
			{
				$('#court_complex_code').focus();
			}
			
			return false;
		}
		else
		{
			//alert(tab_id);
			if(tab_id=='casenumber'){
				fillCaseType('c_no'); 
			} else if(tab_id=='casetype'){
				fillCaseType('c_type');
			} else if(tab_id=='act'){
				fillActType();
			} else if(tab_id=='courtnumber'){
				fillCourtNumber();
			} else if(tab_id=='firnumber'){
                                fillPoliceStation();
                        } 

			if(state_code==3 && tab_id=='filingnumber')
                        {
                                $("#case_type_lbl_div").show();
                                $("#case_type_div").show();
                                fillCaseType('c_type');
                        } else {
                                $("#case_type_lbl_div").hide();
                                $("#case_type_div").hide();
                        }

	

			$("#"+tab_id+"_div").show();
		}
	}
}

function setFlag()
{
	//alert("ii");
	$("#hdn_flag").val('dispute');
}

function fillDistrict(state_code)
{
	//$('#sess_dist_code').chosen('destroy');
	
	var url="casestatus/fillDistrict";

	var postdata ="state_code="+state_code;
	//$('#sess_dist_code').html('');
	//$('#court_complex_code').html('');
	//$('#court_complex_code').prop('selectedIndex',0);
	$('#court_complex_code').html('<option value="">Select court complex</option>');
	//alert(postdata);
	ajaxCall({url:url,postdata:postdata,callback:callbackEST,connection:'N',flag:'header'});
	function callbackEST(obj){ 
		if(obj.status == 1)
		{ 
			$('#sess_dist_code').html(obj.dist_list);
		}	else {
			$('#sess_dist_code').prop('selectedIndex',0);
		}
	}
	
}


function fillCourtComplex(dist_code)
{
	

	var state_code=$('#sess_state_code').val();

	var url="casestatus/fillcomplex";
	
	var postdata ="state_code="+state_code+"&dist_code="+dist_code;
	//$('#court_complex_code').html('');

	ajaxCall({url:url,postdata:postdata,callback:callbackComplex,connection:'N',flag:'header'});
		function callbackComplex(obj){  
			if(obj.status == 1)
			{ 				
				$('#court_complex_code').html(obj.complex_list);
			}			
		}

		//$("#partyname_div").show();

	
}

function funShowDefaultTab(drpdwn_type)
{
         //alert(1);
	var active_tab =  $("#active_tab").val(); 
	//alert(active_tab);
	$(".modal-backdrop.show").hide();	
	//$("#partyname-tabMenu").addClass('active show'); 
	//$("#partynametab").addClass('active show'); 
	//$("#partyname_div").show();
	$("#casenumber-tabMenu").removeClass('active show');
	$("#filingnumber-tabMenu").removeClass('active show');
	$("#advname-tabMenu").removeClass('active show');
	$("#firnumber-tabMenu").removeClass('active show');
	$("#act-tabMenu").removeClass('active show');
	$("#casetype-tabMenu").removeClass('active show');
	$("#orderdate-tabMenu").removeClass('active show'); 
	$("#courtnumber-tabMenu").removeClass('active show'); 
	var state_code = $("#sess_state_code").val() ;
	
	/*$("#res_party").html('');
	$("#co_party").html('');
	 $("#case_no_res").html('');
         $("#cocase_no_res").html('');
	 $("#res_filing").html('');
	$("#res_adv_name").html('');
	 $("#res_fir").html(''); 
 	$("#res_act").html('');
	 $("#res_case_type").html('');
	$("#showList_courtno").html('');
	//$("#showList2").html(''); 
	$("#coorderdt").html('');*/
	$("#res_cause_list").html('');
	$("#res_caveat_search").html('');
	$("#main_back_CauseList").hide();
	$("#caseBusinessDiv_CauseList").html('');
	$("#CauseList").html('');
	$("#printDiv_causelist").hide();
	$("#causeList_div").show();
	 if(active_tab=='party')
	{
		$("#res_party").html('');
		$("#partyname-tabMenu").addClass('active show');
		$("#partynametab").addClass('active show');
		$("#partyname_div").show();
		$("#co_party").html('');
		$("#CSpartyName").html('');
                $("#caseBusinessDiv_csParty").html('');
                $("#caseBusinessDiv").html('');
		$("#printDiv").hide();
                $("#main_back_party").hide();
		// $("#casenumber-tabMenu").addClass('active show');
	}

	if(active_tab=='casenumber')
	{
		fillCaseType('c_no');
		$("#case_no_res").html('');
		$("#partyname-tabMenu").removeClass('active show');
		$("#casenumber-tabMenu").addClass('active show');
		$("#casenumber_div").show();
		$("#cocase_no_res").html('');
		$("#CScaseNumber").html('');
                $("#caseBusinessDiv_csNo").html('');
                $("#printDiv_csNo").hide();
                $("#main_back_caseNo").hide();

	}
	if(active_tab=='filingnumber')
	{
			$("#res_filing").html('');
			$("#partyname-tabMenu").removeClass('active show');
			$("#filingnumber-tabMenu").addClass('active show');
			$("#filingnumber_div").show();
			if(state_code==3 )
			{
				$("#case_type_lbl_div").show();
				$("#case_type_div").show();				
				fillCaseType('c_type');
			} else {
				$("#case_type_lbl_div").hide();
				$("#case_type_div").hide();	
			}

		$("#CSfilingNumber").html('');
                $("#caseBusinessDiv_filingNo").html('');
                $("#printDiv_filingno").hide();
                $("#main_back_filingNo").hide();
	}

	if(active_tab=='advname')
	{
		$("#res_adv_name").html('');
		$("#partyname-tabMenu").removeClass('active show');
		$("#advname-tabMenu").addClass('active show');
		$("#advname_div").show();
		$("#CSAdvName").html('');
                $("#caseBusinessDiv_AdvName").html('');
                $("#printDiv_advnm").hide();
                $("#main_back_AdvName").hide();

	}
	if(active_tab=='firnumber')
	{	
		fillPoliceStation();
		$("#res_fir").html('');
		$("#partyname-tabMenu").removeClass('active show');
		$("#firnumber-tabMenu").addClass('active show');
		$("#firnumber_div").show();
		$("#CSFIRNumber").html('');
                $("#caseBusinessDiv_Fir").html('');
                $("#printDiv_fir").hide();
                $("#main_back_Fir").hide();
	}
	if(active_tab=='act')
	{
		fillActType();
		$("#res_act").html('');
		$("#partyname-tabMenu").removeClass('active show');
		$("#act-tabMenu").addClass('active show');
		$("#act_div").show();
		$("#CSact").html('');
                $("#caseBusinessDiv_act").html('');
                $("#printDiv_act").hide();
                $("#main_back_act").hide();

	}
	 if(active_tab=='casetype')
         {
	      fillCaseType('c_type');
              $("#res_case_type").html('');
              $("#partyname-tabMenu").removeClass('active show');
	      $("#casetype-tabMenu").addClass('active show');
              $("#case_type_1").val('');
      	      $("#search_year").val('');
	      $("#casetype_div").show();
	      $("#CScaseType").html('');
              $("#caseBusinessDiv_caseType").html('');
              $("#printDiv_casetype").hide();
              $("#main_back_caseType").hide();

             // $("#res_case_type").html('');
         }

	if(active_tab=='courtnumber')
	{
			fillCourtNumber();
			$("#showList_courtno").html('');
			$("#partynametab").removeClass('active show');
			$("#courtnumber-tabMenu").addClass('active show');
	}
	if(active_tab=='orderdate')
	{
			$("#coorderdt").html('');
			$("#partynametab").removeClass('active show');
			$("#orderdate-tabMenu").addClass('active show');
	}
	if(active_tab=='partyaddress'  )
	{
			//$("#coorderdt").html('');
		//$("#partyaddress-tabMenu").addClass('active show');
		//$("#dispute-tabMenu").removeClass('active show');
		$("#partyAddress_div").show();
		$("#dispute_div").hide();

	}else if(active_tab=='dispute' )
	{
		//$("#partyaddress-tabMenu").removeClass('active show');
		//$("#dispute-tabMenu").addClass('active show');
		$("#frm_partyAddress").hide();
		$("#dispute_div").show();
		

	}


    var state_code=$('#sess_state_code').val();
	var dist_code=$('#sess_dist_code').val();
    var court_complex_code=$('#court_complex_code').val();
	var court_complex_codeArr=court_complex_code.split('@');
	var differ_mast_est=court_complex_codeArr[2];
	var combo_val=court_complex_code;
    var court_codeArr=court_complex_codeArr[1];
	var complex_code=court_complex_codeArr[0];
	var s_type = $("#s_type").val();
	//alert('stype=='+s_type);
	if(court_codeArr=='')
		{
			court_codeArr=0;
		}

	if(differ_mast_est=='Y')
		{
			$("#est_codes").show();
			if(drpdwn_type=='complex')
			{
				//setTimeout(function(){fadeout()},300);
				//$("#sees_complex_code").val(complex_code);
				fillEst();
			}
		}
	else
		{
			//$("#sees_complex_code").val(complex_code);
			$('#court_est_code').val('');
			$("#est_codes").hide();
			
		}
		//if($("input[name='searchcaveat']:checked").val()=='subordinateCourt')
		//alert($("input[name='searchcaveat']:checked").val());
	//	alert(s_type);	
		if(s_type=='cause') 
			setTimeout(function(){ fillCauseList()},250);
		else if (s_type=='caveat')
		{
			if( $('#subordinateCourt').is(':checked') || $("input[name='searchcaveat']:checked").val()=='subordinateCourt' ){
                        //alert("if");
                                fillCaseType('caveat_search');
                  } 


		}

//alert(1);
	//========FOR LOCATION=================//
	var globalLocationClecked =$('#location_checked').val();
	//alert(globalLocationClecked);
	if(globalLocationClecked=="Y")
	{
		getLocation();
		
	}
}


function fillEst()
{
	setTimeout(function(){
	
	$("#subordinate_court_name").html('');
	var state_code = $("#sess_state_code").val() ;//document.getElementById('sess_state_code').value;

	var dist_code=$('#sess_dist_code').val();

	var courtArr=$('#court_complex_code').val();

	//var courtArr=document.getElementById('court_complex_code').value;
	var court_est_arr=courtArr.split('@');
	var court_complex=court_est_arr[0];
	var court_est=court_est_arr[1];

	var url="casestatus/fillCourtEstablishment";
	
	var postdata ="state_code="+state_code+"&dist_code="+dist_code+"&court_complex_code="+court_complex;
	
	
	if(state_code!=0 && dist_code!=0)
	{	
		var lang_sel='E';
		var show_lang_name='';
	 
		ajaxCall({url:url,postdata:postdata,callback:callbackComplex_est,connection:'N',flag:'header'});
		function callbackComplex_est(obj){  //alert(obj.establishment_list);
			if(obj.status == 1)
			{ 				
				$('#court_est_code').html(obj.establishment_list);
			} 
		}

	 
	}
	},50);



}
/*var court_est_arr=courtArr.split('@');
var flag=court_est_arr[2];*/

function fillCaseType(search_type)
{  //alert(search_type);
	var state_code =$("#sess_state_code").val() ;
	var dist_code=$('#sess_dist_code').val();
	var courtArr=$('#court_complex_code').val();
	var court_est_arr=courtArr.split('@');
	var court_complex=court_est_arr[0];
	var court_est=court_est_arr[1];
	var flag=court_est_arr[2];
	var active_tab = $("#active_tab").val();
	
	if(flag=='Y' && $("#court_est_code").val()==0){
	    alert("Select Establishment");
		 return  false;
	}

	if(flag=='Y')
		var est_code = $("#court_est_code").val();

	else var est_code = '';

	var url="casestatus/fillCaseType";
	
	var postdata ="state_code="+state_code+"&dist_code="+dist_code+"&court_complex_code="+court_complex+"&est_code="+est_code+'&search_type='+search_type;


	ajaxCall({url:url,postdata:postdata,callback:callbackComplex,connection:'N'});
		function callbackComplex(obj){  
			if(obj.status == 1)
			{ 	
				if(search_type=='c_no'){

					$('#case_type').html(obj.casetype_list);
				
				}else{
						$('#case_type').html();
				}
				if(search_type=='c_type' && active_tab=='casetype'){

					$('#case_type_2').html(obj.casetype_list);
				
				} else if(search_type=='c_type'){

                                	$('#case_type_1').html(obj.casetype_list);

                                }

				else{
					$('#case_type_1').html();
				}
				if(search_type=='caveat_search'){
				//fillSubordinateCourt();
					$('#subordinate_court_name').html(obj.subordinate_court_list);
					$('#case_type_caveat').html(obj.casetype_list);
				
				}else{
					$('#case_type_caveat').html();
				}

				$(".modal-backdrop").hide();		
			}			
			refreshCaptcha();
		}


}

function fillCourtNumber()
{
	
	 //alert("In Court Order");
		var state_code =$("#sess_state_code").val() ;//document.getElementById('sess_state_code').value;
		
		var dist_code=$('#sess_dist_code').val();
		var courtArr=$('#court_complex_code').val();
		var court_est_arr=courtArr.split('@');
		var court_complex=court_est_arr[0];
		var court_est=court_est_arr[1];
		var flag=court_est_arr[2];
		//$('#nnjudgecode1').chosen('destroy');
		
		if(flag=='Y' && $("#court_est_code").val()==0){
			alert("Select Establishment");
		}
		if(flag=='Y')
			var est_code = $("#court_est_code").val();
		else
			var est_code =  court_est ;//'';

		var url="courtorder/fillCourtNumber";
		
		var postdata ="state_code="+state_code+"&dist_code="+dist_code+"&court_complex_code="+court_complex+"&est_code="+est_code;
		//alert(postdata);

		ajaxCall({url:url,postdata:postdata,callback:callbackComplex,connection:'N'});
			function callbackComplex(obj){  
				if(obj.status == 1)
				{ 			
					//alert(obj.courtnumber_list);
					$('#nnjudgecode1').html(obj.courtnumber_list);
					
				} else{
				  $("#nnjudgecode1").html(''); //11-11
				}		

			refreshCaptcha();
		}
		
}

function fillPoliceStation()
{
 
     var state_code =$("#sess_state_code").val() ;//document.getElementById('sess_state_code').value;
	//alert(state_code);
	var dist_code=$('#sess_dist_code').val();
	var courtArr=$('#court_complex_code').val();
	var court_est_arr=courtArr.split('@');
	var court_complex=court_est_arr[0];
	var court_est=court_est_arr[1];
	var flag=court_est_arr[2];
	//alert(flag);
	if(flag=='Y' && $("#court_est_code").val()==0){
	    alert("Select Establishment");
	}
	if(flag=='Y')
		var est_code = $("#court_est_code").val();
	else 
	var est_code = '';
	//alert(1);
	var url="casestatus/fillPoliceStation";
	
	var postdata ="state_code="+state_code+"&dist_code="+dist_code+"&court_complex_code="+court_complex+"&est_code="+est_code;


	ajaxCall({url:url,postdata:postdata,callback:callbackComplex,connection:'N'});
		function callbackComplex(obj){  
			if(obj.status == 1)
			{ 				
				$('#police_st_code').html(obj.police_station_list);
				//$('#case_type_order').html(obj.casetype_list);
			}			
			refreshCaptcha();
		}


}


function fillActType(state_code)
{

	 var state_code =$("#sess_state_code").val() ;//document.getElementById('sess_state_code').value;
	//alert(state_code);
	var dist_code=$('#sess_dist_code').val();
	var courtArr=$('#court_complex_code').val();
	var court_est_arr=courtArr.split('@');
	var court_complex=court_est_arr[0];
	var court_est=court_est_arr[1];
	var flag=court_est_arr[2];
	//alert(flag);
	if(flag=='Y' && $("#court_est_code").val()==0){
	    alert("Select Establishment");
	}
	if(flag=='Y')
		var est_code = $("#court_est_code").val();
	else var est_code = '';

	var search_act=$("#search_act").val();

	var url="casestatus/fillActType";
	
	var postdata ="state_code="+state_code+"&dist_code="+dist_code+"&court_complex_code="+court_complex+"&est_code="+est_code+"&search_act="+search_act;
//	alert(postdata);

	ajaxCall({url:url,postdata:postdata,callback:callbackComplex,connection:'N'});
		function callbackComplex(obj){  
			if(obj.status == 1)
			{ 				
				$('#actcode').html(obj.act_list);
				//$('#case_type_order').html(obj.casetype_list);
			}
			refreshCaptcha();			
		}
	
}


function fillCauseList()
{
 setTimeout(function(){
  	$(".modal-backdrop.show").hide();
	 var state_code =$("#sess_state_code").val() ;//document.getElementById('sess_state_code').value;
	//alert(state_code);
	var dist_code=$('#sess_dist_code').val();
	var courtArr=$('#court_complex_code').val();
	var court_est_arr=courtArr.split('@');
	var court_complex=court_est_arr[0];
	var court_est=court_est_arr[1];
	var flag=court_est_arr[2];
	//alert(flag);
	if(flag=='Y' && $("#court_est_code").val()==0){
	    alert("Select Establishment");
	}
	if(flag=='Y')
		var est_code = $("#court_est_code").val();
	else var est_code = court_est ; //'';

	var search_act=$("#search_act").val();

	var url="cause_list/fillCauseList";
	
	var postdata ="state_code="+state_code+"&dist_code="+dist_code+"&court_complex_code="+court_complex+"&est_code="+est_code+"&search_act="+search_act;
	//alert(postdata);

	ajaxCall({url:url,postdata:postdata,callback:callbackComplex,connection:'N'});
		function callbackComplex(obj){  
			if(obj.status == 1)
			{ 				
				$('#CL_court_no').html(obj.cause_list);
				//$('#case_type_order').html(obj.casetype_list);
			}else{
				$('#CL_court_no').html("");
			}			
		}
	},1500);
	
}

function getLocation(){
	
	
		var state_code_new=$('#sess_state_code').val();
		var state_code_arr=state_code_new.split('~');
		var state_code=state_code_arr[0];
		state_code = state_code.replace(/\s/g,'');  
		var dist_code=$('#sess_dist_code').val();
		var court_complex_code=$('#court_complex_code').val();
		var court_complex_codeArr=court_complex_code.split('@');
		var court_codeArr=court_complex_codeArr[1];
		var send_str="&state_code="+state_code+"&dist_code="+dist_code;
		send_str+="&court_complex_code="+court_complex_codeArr[0];
		var url="location/location_details";

		ajaxCall({url:url,postdata:send_str,callback:callbackComplex,connection:'N'});
		  function callbackComplex(obj) {
	  //alert(obj.stat);
    if (obj.stat == 1) {
      var mylocation = "";
      $("#locationDiv").show();
      var complex_name = $("#court_complex_code option:selected").text();
      var LatitudeLongitudeArr = obj.result.split("~");
      var lon = LatitudeLongitudeArr[1];
      var lat = LatitudeLongitudeArr[0];
      mylocation = window.open(
        "https://bhuvan-app1.nrsc.gov.in/web_view/index.php?x=" +
          lat +
          "&y=" +
          lon +
          "&buff=5",
        "Location",
        "width=800,height=600",
      );

      if (!mylocation.close()) {
        mylocation.close();
        mylocation = window.open(
          "https://bhuvan-app1.nrsc.gov.in/web_view/index.php?x=" +
            lat +
            "&y=" +
            lon +
            "&buff=5",
          "Location",
          "width=800,height=600",
        );
      }
    }
	else 
	{
		errorAlert(obj.result);
        return;
	}
  }
	
	
}

 function fillSubordinateCourt()
{
	//alert(123);
	//$('#subordinate_court_name').chosen('destroy');
	var state_code =$("#sess_state_code").val() ;
	var dist_code=$('#sess_dist_code').val();
	var courtArr=$('#court_complex_code').val();
	var court_est_arr=courtArr.split('@');
	var court_complex=court_est_arr[0];
	var court_est=court_est_arr[1];
	var flag=court_est_arr[2];

	if(flag=='Y' && $("#court_est_code").val()==0){
	    alert("Select Establishment");
	}
	if(flag=='Y')
		var est_code = $("#court_est_code").val();
	else var est_code = '';

	var url="caveat_search/fillSubordinateCourt";
	


	var postdata ="state_code="+state_code+"&dist_code="+dist_code+"&court_complex_code="+court_complex+"&est_code="+est_code;
	//alert(postdata);
	ajaxCall({url:url,postdata:postdata,callback:callbackEST,connection:'N'});
	function callbackEST(obj){ 
		if(obj.status == 1)
		{ 
			$('#subordinate_court_name').html(obj.subordinate_court_list);
		}	
	}
	
}

