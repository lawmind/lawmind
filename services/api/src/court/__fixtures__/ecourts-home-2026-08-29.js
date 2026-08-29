function setBackgroud(backgroudcolor)
{
	var url="home/setBackgroud/"+backgroudcolor;
	var postdata='';
	ajaxCall({url:url,postdata:postdata,callback:callback,loader:false});
	function callback(result)
	{
		
	}
}

function increaseFont()
{
	$('#incresefont').attr("href", "javascript:void(0)");
	
}

function downloadAPK(str)
{
	var url="home/downloadAPK/"+str;	
	var postdata = "" ;			
	//alert(url);
	function callbackEST(obj)
	{		
		if(obj.status1)
		{
			requestUri('home/downloadAPK/'+str+'/D');
		}
	}
	ajaxCall({url:url,postdata:postdata,callback:callbackEST});
}


//**show business data *************/
